import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { SellerService } from '../seller.service';
import { Router } from '@angular/router';
import { ProductCategory } from '@shared/enums';

@Component({
  selector: 'app-seller-product-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCardModule,
    MatSelectModule,
    MatIconModule
  ],
  templateUrl: './seller-product-form.component.html',
  styleUrls: ['./seller-product-form.component.scss'],
})
export class SellerProductFormComponent {
  form!: FormGroup;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  images: File[] = [];
  previews: { url: string, name: string }[] = [];
  submitting = false;
  isDragging = false;

  categories = Object.values(ProductCategory);

  constructor(private fb: FormBuilder, private seller: SellerService, private router: Router) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      category: [ProductCategory.Produce, Validators.required],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      unit: ['piece', Validators.required],
      stockQuantity: [1, [Validators.required, Validators.min(0)]],
      description: ['', Validators.maxLength(2000)],
    });
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(Array.from(input.files));
    }
  }

  private handleFiles(files: File[]): void {
    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024);
    
    // Max 5 images
    const remainingSlots = 5 - this.images.length;
    const filesToAdd = validFiles.slice(0, remainingSlots);

    for (const f of filesToAdd) {
      this.images.push(f);
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previews.push({ url: e.target.result, name: f.name });
      };
      reader.readAsDataURL(f);
    }
  }

  removeImage(index: number): void {
    this.images.splice(index, 1);
    this.previews.splice(index, 1);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    
    this.submitting = true;
    const fd = new FormData();
    
    // Append form data
    Object.keys(this.form.value).forEach(key => {
      const val = this.form.value[key];
      if (val !== null && val !== undefined) {
        fd.append(key, String(val));
      }
    });

    // Append images
    this.images.forEach((f) => fd.append('images', f, f.name));

    this.seller.addProduct(fd).subscribe({ 
      next: () => this.router.navigate(['/seller/products']), 
      error: () => (this.submitting = false) 
    });
  }
}
