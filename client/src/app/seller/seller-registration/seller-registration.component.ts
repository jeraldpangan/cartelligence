import { Component } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { SellerService } from '../seller.service';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
@Component({
  selector: 'app-seller-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatCardModule],
  templateUrl: './seller-registration.component.html',
  styleUrls: ['./seller-registration.component.scss'],
})
export class SellerRegistrationComponent {
  form!: FormGroup;

  submitting = false;

  constructor(private fb: FormBuilder, private seller: SellerService, private router: Router, private auth: AuthService) {
    this.form = this.fb.group({
      storeName: ['', [Validators.required, Validators.minLength(3)]],
      storeDescription: [''],
      storeLogoUrl: [''],
      businessRegistration: [''],
      supportPhone: [''],
    });
  }

  submit(): void {
    if (this.form.invalid) return;
    this.submitting = true;
    const payload = {
      store_name: this.form.value.storeName,
      store_description: this.form.value.storeDescription,
      store_logo_url: this.form.value.storeLogoUrl,
      business_registration: this.form.value.businessRegistration,
      support_phone: this.form.value.supportPhone,
    };

    this.seller.registerSeller(payload).subscribe({
      next: () => {
        this.auth.refreshAccessToken().subscribe({
          next: () => this.router.navigate(['/seller']),
          error: () => this.router.navigate(['/seller'])
        });
      },
      error: () => (this.submitting = false),
    });
  }
}
