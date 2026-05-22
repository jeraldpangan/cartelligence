import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { UserRole } from '@shared/enums';
import {
  EMAIL_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_UPPERCASE_REGEX,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_DIGIT_REGEX,
  PASSWORD_SPECIAL_REGEX,
  FULL_NAME_MIN_LENGTH,
  FULL_NAME_MAX_LENGTH,
  DELIVERY_ADDRESS_MIN_LENGTH,
  DELIVERY_ADDRESS_MAX_LENGTH,
} from '@shared/validation';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatCheckboxModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  registerForm: FormGroup;
  hidePassword = signal(true);
  hideConfirmPassword = signal(true);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  logoFailed = signal(false);
  showAddress = signal(false);

  readonly UserRole = UserRole;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.registerForm = this.fb.group({
      role: [UserRole.Buyer, [Validators.required]],
      email: ['', [Validators.required, Validators.pattern(EMAIL_REGEX)]],
      password: ['', [Validators.required, this.passwordValidator]],
      confirmPassword: ['', [Validators.required]],
      fullName: ['', [
        Validators.required,
        Validators.minLength(FULL_NAME_MIN_LENGTH),
        Validators.maxLength(FULL_NAME_MAX_LENGTH),
      ]],
      deliveryAddress: ['123 Main St, Olongapo City', [
        Validators.required,
        Validators.minLength(DELIVERY_ADDRESS_MIN_LENGTH),
        Validators.maxLength(DELIVERY_ADDRESS_MAX_LENGTH),
      ]],
      agreeToTerms: [false, [Validators.requiredTrue]]
    }, { validators: this.passwordsMatchValidator });
  }

  get selectedRole(): UserRole {
    return this.registerForm.get('role')?.value as UserRole ?? UserRole.Buyer;
  }

  get isSeller(): boolean {
    return this.selectedRole === UserRole.Seller;
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((v) => !v);
  }

  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update((v) => !v);
  }

  private passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (!password || !confirmPassword) return null;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  getPasswordStrength(): { score: number; label: string; color: string } {
    const value = this.registerForm.get('password')?.value || '';
    if (!value) {
      return { score: 0, label: '', color: '#cbd5e1' };
    }

    let score = 0;
    
    // 1. Length >= 8
    if (value.length >= 8) score++;
    // 2. Contains uppercase & lowercase
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    // 3. Contains number and special char
    if (/\d/.test(value) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(value)) score++;

    if (score <= 1) {
      return { score: 1, label: 'Weak', color: '#ef4444' };
    } else if (score === 2) {
      return { score: 2, label: 'Medium', color: '#f59e0b' };
    } else {
      return { score: 3, label: 'Strong', color: '#10b981' };
    }
  }

  private passwordValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value || '';
    const errors: ValidationErrors = {};

    if (value.length < PASSWORD_MIN_LENGTH) {
      errors['minlength'] = { requiredLength: PASSWORD_MIN_LENGTH, actualLength: value.length };
    }
    if (value.length > PASSWORD_MAX_LENGTH) {
      errors['maxlength'] = { requiredLength: PASSWORD_MAX_LENGTH, actualLength: value.length };
    }
    if (!PASSWORD_UPPERCASE_REGEX.test(value)) {
      errors['noUppercase'] = true;
    }
    if (!PASSWORD_LOWERCASE_REGEX.test(value)) {
      errors['noLowercase'] = true;
    }
    if (!PASSWORD_DIGIT_REGEX.test(value)) {
      errors['noDigit'] = true;
    }
    if (!PASSWORD_SPECIAL_REGEX.test(value)) {
      errors['noSpecial'] = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  getPasswordErrors(): string[] {
    const control = this.registerForm.get('password');
    if (!control || !control.errors || !control.touched) return [];

    const errors: string[] = [];
    if (control.errors['minlength']) {
      errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
    }
    if (control.errors['maxlength']) {
      errors.push(`At most ${PASSWORD_MAX_LENGTH} characters`);
    }
    if (control.errors['noUppercase']) {
      errors.push('One uppercase letter');
    }
    if (control.errors['noLowercase']) {
      errors.push('One lowercase letter');
    }
    if (control.errors['noDigit']) {
      errors.push('One digit');
    }
    if (control.errors['noSpecial']) {
      errors.push('One special character');
    }
    return errors;
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email, password, fullName, deliveryAddress, role } = this.registerForm.value;

    this.authService.register({ email, password, fullName, deliveryAddress, role }).subscribe({
      next: () => {
        this.isLoading.set(false);
        const roleLabel = role === UserRole.Seller ? 'seller' : 'buyer';
        this.successMessage.set(`Account created as ${roleLabel}! Redirecting to login...`);
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (error.status === 409 || error.error?.code === 'CONFLICT') {
          this.errorMessage.set('An account with this email already exists.');
        } else if (error.error?.details?.length) {
          const fieldErrors = error.error.details
            .map((d: { field: string; message: string }) => d.message)
            .join('. ');
          this.errorMessage.set(fieldErrors);
        } else {
          this.errorMessage.set('Registration failed. Please try again.');
        }
      },
    });
  }
}
