import {
  Component,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil } from 'rxjs';
import { SellerService, SellerProduct } from '../seller.service';
import { DialogService } from '../../core/confirm-dialog/dialog.service';
import { ProductCategory } from '@shared/enums';

/** Maximum number of images allowed per product. Requirements: 3.3 */
const MAX_IMAGES = 5;

/** Maximum file size in bytes (5 MB). Requirements: 3.2 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Accepted MIME types. Requirements: 3.1 */
const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Accepted file extensions for the file input accept attribute. */
const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.webp';

/**
 * Represents a pending image (new file selected by the user, not yet uploaded).
 */
interface PendingImage {
  kind: 'pending';
  file: File;
  previewUrl: string;
  isPrimary: boolean;
}

/**
 * Represents an existing image already stored on the server.
 */
interface ExistingImage {
  kind: 'existing';
  id: string;
  url: string;
  filename: string;
  sortOrder: number;
  isPrimary: boolean;
}

/** Union type for the image list. */
type ImageEntry = PendingImage | ExistingImage;

/**
 * Custom validator: unit_price must be between 0.01 and 9,999,999.99 with at most 2 decimal places.
 * Requirements: 2.6
 */
function unitPriceValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (isNaN(num)) return { invalidPrice: true };
  if (num < 0.01 || num > 9_999_999.99) return { priceOutOfRange: true };
  // Check at most 2 decimal places
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return { tooManyDecimals: true };
  return null;
}

/**
 * ProductFormComponent — create or edit a seller product with multi-image upload.
 *
 * Handles:
 *   - Reactive form with real-time validation (Requirements: 2.6, 2.8)
 *   - Multi-image upload with drag-and-drop, preview, primary selection (Requirements: 3.1–3.6, 3.8)
 *   - Image reordering via move-up / move-down controls
 *   - Create mode (POST) and edit mode (PUT) (Requirements: 2.1, 2.3)
 *   - Client-side enforcement of max 5 images, 5 MB/file, JPEG/PNG/WebP (Requirements: 3.1, 3.2, 3.3)
 */
@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatDialogModule,
  ],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.scss'],
})
export class ProductFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sellerService = inject(SellerService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogService = inject(DialogService);
  private readonly destroy$ = new Subject<void>();

  // ─── Mode ────────────────────────────────────────────────────────────────────

  /** Product ID when in edit mode; null in create mode. */
  productId: string | null = null;

  /** True when editing an existing product. */
  get isEditMode(): boolean {
    return this.productId !== null;
  }

  // ─── Form ────────────────────────────────────────────────────────────────────

  form!: FormGroup;

  /** All valid ProductCategory values for the dropdown. */
  readonly categories = Object.values(ProductCategory);

  /** Human-readable labels for each category. */
  readonly categoryLabels: Record<ProductCategory, string> = {
    [ProductCategory.Produce]: 'Produce',
    [ProductCategory.Dairy]: 'Dairy',
    [ProductCategory.Meat]: 'Meat',
    [ProductCategory.Beverages]: 'Beverages',
    [ProductCategory.Snacks]: 'Snacks',
    [ProductCategory.Household]: 'Household',
    [ProductCategory.PersonalCare]: 'Personal Care',
    [ProductCategory.BabiesToys]: 'Babies & Toys',
  };

  // ─── Image state ─────────────────────────────────────────────────────────────

  /** Ordered list of images (existing + pending). */
  images: ImageEntry[] = [];

  /** True when a drag is in progress over the drop zone. */
  isDragOver = false;

  /** Validation error message for the image section. */
  imageError: string | null = null;

  /** Computed: number of images currently in the list. */
  get imageCount(): number {
    return this.images.length;
  }

  /** Computed: true when the image limit has been reached. */
  get isImageLimitReached(): boolean {
    return this.images.length >= MAX_IMAGES;
  }

  // ─── Loading / submission state ───────────────────────────────────────────────

  isLoadingProduct = false;
  isSubmitting = false;

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.buildForm();

    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.isEditMode) {
      this.loadProduct(this.productId!);
    }
  }

  ngOnDestroy(): void {
    // Revoke object URLs to avoid memory leaks
    this.images.forEach((img) => {
      if (img.kind === 'pending') {
        URL.revokeObjectURL(img.previewUrl);
      }
    });
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Form construction ───────────────────────────────────────────────────────

  private buildForm(): void {
    this.form = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.minLength(1), Validators.maxLength(255)],
      ],
      description: ['', [Validators.maxLength(2000)]],
      category: ['', [Validators.required]],
      unitPrice: [
        '',
        [Validators.required, unitPriceValidator],
      ],
      unit: [
        '',
        [Validators.required, Validators.minLength(1), Validators.maxLength(50)],
      ],
      stockQuantity: [
        '',
        [
          Validators.required,
          Validators.min(0),
          Validators.max(999_999),
          Validators.pattern(/^\d+$/),
        ],
      ],
    });
  }

  // ─── Edit mode: load existing product ────────────────────────────────────────

  private loadProduct(id: string): void {
    this.isLoadingProduct = true;

    this.sellerService
      .getProduct(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (product: SellerProduct) => {
          this.form.patchValue({
            name: product.name,
            description: product.description ?? '',
            category: product.category,
            unitPrice: product.unitPrice,
            unit: product.unit,
            stockQuantity: product.stockQuantity,
          });

          // Populate existing images in sort_order order
          const sorted = [...(product.images ?? [])].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          this.images = sorted.map(
            (img): ExistingImage => ({
              kind: 'existing',
              id: img.id,
              url: img.url,
              filename: img.filename,
              sortOrder: img.sortOrder,
              isPrimary: img.isPrimary,
            }),
          );

          this.isLoadingProduct = false;
        },
        error: () => {
          this.isLoadingProduct = false;
          this.snackBar.open('Failed to load product. Please try again.', 'Dismiss', {
            duration: 4000,
          });
          this.router.navigate(['/seller/products']);
        },
      });
  }

  // ─── Image upload handling ────────────────────────────────────────────────────

  /** Called when the user clicks the upload area or the "Add Images" button. */
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.addFiles(Array.from(input.files));
      // Reset input so the same file can be re-selected if removed
      input.value = '';
    }
  }

  /** Drag-and-drop: dragover */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  /** Drag-and-drop: dragleave */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  /** Drag-and-drop: drop */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.addFiles(Array.from(files));
    }
  }

  /**
   * Validates and adds files to the image list.
   * Enforces: max 5 images, 5 MB/file, JPEG/PNG/WebP only.
   * Requirements: 3.1, 3.2, 3.3
   */
  private addFiles(files: File[]): void {
    this.imageError = null;
    const errors: string[] = [];

    for (const file of files) {
      // Check total count first
      if (this.images.length >= MAX_IMAGES) {
        errors.push(`Maximum ${MAX_IMAGES} images allowed. Some files were not added.`);
        break;
      }

      // Validate MIME type (Requirements: 3.1)
      if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
        errors.push(
          `"${file.name}" is not a supported format. Use JPEG, PNG, or WebP.`,
        );
        continue;
      }

      // Validate file size (Requirements: 3.2)
      if (file.size > MAX_FILE_SIZE) {
        errors.push(
          `"${file.name}" exceeds the 5 MB size limit (${this.formatFileSize(file.size)}).`,
        );
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const isPrimary = this.images.length === 0; // First image is primary by default

      this.images = [
        ...this.images,
        { kind: 'pending', file, previewUrl, isPrimary },
      ];
    }

    if (errors.length > 0) {
      this.imageError = errors.join(' ');
    }
  }

  /** Removes an image from the list. If it was primary, promote the next one. */
  removeImage(index: number): void {
    const removed = this.images[index];
    const newImages = this.images.filter((_, i) => i !== index);

    // If the removed image was primary and there are remaining images, make the first one primary
    if (removed.isPrimary && newImages.length > 0) {
      newImages[0] = { ...newImages[0], isPrimary: true };
    }

    this.images = newImages;
    this.imageError = null;

    // Revoke object URL for pending images
    if (removed.kind === 'pending') {
      URL.revokeObjectURL(removed.previewUrl);
    }
  }

  /** Sets the image at the given index as the primary image. */
  setPrimary(index: number): void {
    this.images = this.images.map((img, i) => ({
      ...img,
      isPrimary: i === index,
    }));
  }

  /** Moves an image one position earlier in the list (reordering). */
  moveImageUp(index: number): void {
    if (index === 0) return;
    const newImages = [...this.images];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    this.images = newImages;
  }

  /** Moves an image one position later in the list (reordering). */
  moveImageDown(index: number): void {
    if (index === this.images.length - 1) return;
    const newImages = [...this.images];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    this.images = newImages;
  }

  /** Returns the preview URL for an image entry. */
  getImagePreviewUrl(img: ImageEntry): string {
    return img.kind === 'pending' ? img.previewUrl : img.url;
  }

  // ─── Form submission ──────────────────────────────────────────────────────────

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Require at least 1 image in create mode (Requirements: 3.8)
    if (!this.isEditMode && this.images.length === 0) {
      this.imageError = 'At least 1 image is required.';
      return;
    }

    this.isSubmitting = true;
    this.imageError = null;

    if (this.isEditMode) {
      this.submitUpdate();
    } else {
      this.submitCreate();
    }
  }

  /** Builds FormData and calls createProduct. */
  private submitCreate(): void {
    const formData = this.buildFormData();

    this.sellerService
      .createProduct(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.snackBar.open('Product created successfully!', 'Dismiss', { duration: 3000 });
          this.router.navigate(['/seller/products']);
        },
        error: (err) => {
          this.isSubmitting = false;
          const message = err?.error?.message ?? 'Failed to create product. Please try again.';
          this.dialogService.error('Create Failed', message);
        },
      });
  }

  /** Calls updateProduct with the form values and pending images via FormData. */
  private submitUpdate(): void {
    const formData = this.buildFormData();

    this.sellerService
      .updateProduct(this.productId!, formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.snackBar.open('Product updated successfully!', 'Dismiss', { duration: 3000 });
          this.router.navigate(['/seller/products']);
        },
        error: (err) => {
          this.isSubmitting = false;
          const message = err?.error?.message ?? 'Failed to update product. Please try again.';
          this.dialogService.error('Update Failed', message);
        },
      });
  }

  /** Builds a FormData object from the current form values and pending images. */
  private buildFormData(): FormData {
    const raw = this.form.getRawValue();
    const formData = new FormData();

    formData.append('name', raw.name);
    formData.append('category', raw.category);
    formData.append('unitPrice', String(Number(raw.unitPrice)));
    formData.append('unit', raw.unit);
    formData.append('stockQuantity', String(Number(raw.stockQuantity)));
    if (raw.description) {
      formData.append('description', raw.description);
    }

    // Append pending image files
    this.images.forEach((img) => {
      if (img.kind === 'pending') {
        formData.append('images', img.file);
      }
    });

    return formData;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Returns a human-readable file size string. */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Returns the error message for a given form control. */
  getFieldError(controlName: string): string | null {
    const control = this.form.get(controlName);
    if (!control || !control.invalid || !control.touched) return null;

    const errors = control.errors;
    if (!errors) return null;

    if (errors['required']) return 'This field is required.';
    if (errors['minlength']) {
      return `Minimum ${errors['minlength'].requiredLength} characters required.`;
    }
    if (errors['maxlength']) {
      return `Maximum ${errors['maxlength'].requiredLength} characters allowed.`;
    }
    if (errors['min']) return `Minimum value is ${errors['min'].min}.`;
    if (errors['max']) return `Maximum value is ${errors['max'].max}.`;
    if (errors['pattern']) return 'Must be a whole number.';
    if (errors['invalidPrice']) return 'Enter a valid price.';
    if (errors['priceOutOfRange']) return 'Price must be between ₱0.01 and ₱9,999,999.99.';
    if (errors['tooManyDecimals']) return 'Price can have at most 2 decimal places.';

    return 'Invalid value.';
  }

  /** Returns true if the given control has a visible error. */
  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control && control.invalid && control.touched);
  }

  /** Page title based on mode. */
  get pageTitle(): string {
    return this.isEditMode ? 'Edit Product' : 'Add New Product';
  }

  /** Submit button label based on mode. */
  get submitLabel(): string {
    return this.isEditMode ? 'Save Changes' : 'Create Product';
  }

  /** Exposed constants for the template. */
  readonly maxImages = MAX_IMAGES;
  readonly acceptedExtensions = ACCEPTED_EXTENSIONS;
}
