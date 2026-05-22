import { Component } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { SellerService } from '../seller.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-seller-product-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCardModule, MatSelectModule],
  templateUrl: './seller-product-form.component.html',
  styleUrls: ['./seller-product-form.component.scss'],
})
export class SellerProductFormComponent {
  form!: FormGroup;

  images: File[] = [];
  previews: string[] = [];
  submitting = false;

  constructor(private fb: FormBuilder, private seller: SellerService, private router: Router) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      quantity: [1, [Validators.required, Validators.min(0)]],
      color: [''],
      size: [''],
      description: [''],
    });
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.images = Array.from(input.files);
    this.previews = [];
    for (const f of this.images) {
      const reader = new FileReader();
      reader.onload = (e: any) => this.previews.push(e.target.result);
      reader.readAsDataURL(f);
    }
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitting = true;
    const fd = new FormData();
    fd.append('name', String(this.form.value.name ?? ''));
    fd.append('price', String(this.form.value.price ?? 0));
    fd.append('quantity', String(this.form.value.quantity ?? 0));
    fd.append('color', String(this.form.value.color ?? ''));
    fd.append('size', String(this.form.value.size ?? ''));
    fd.append('description', String(this.form.value.description ?? ''));
    this.images.forEach((f) => fd.append('images', f, f.name));

    this.seller.addProduct(fd).subscribe({ next: () => this.router.navigate(['/seller/dashboard']), error: () => (this.submitting = false) });
  }
}
