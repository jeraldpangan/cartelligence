import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../auth.service';
import {
  EMAIL_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_UPPERCASE_REGEX,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_DIGIT_REGEX,
  PASSWORD_SPECIAL_REGEX,
} from '@shared/validation';

@Component({
  selector: 'app-password-reset',
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
  ],
  templateUrl: './password-reset.component.html',
  styleUrl: './password-reset.component.scss',
})
export class PasswordResetComponent implements OnInit {
  requestForm: FormGroup;
  resetForm: FormGroup;
  hidePassword = signal(true);
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  mode = signal<'request' | 'reset'>('request');
  private resetToken = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.requestForm = this.fb.group({
      email: ['', [Validators.required, Validators.pattern(EMAIL_REGEX)]],
    });

    this.resetForm = this.fb.group({
      newPassword: ['', [Validators.required, this.passwordValidator]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: this.passwordMatchValidator });
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['token']) {
        this.resetToken = params['token'];
        this.mode.set('reset');
      }
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update((v) => !v);
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

  private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  getPasswordErrors(): string[] {
    const control = this.resetForm.get('newPassword');
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

  onRequestSubmit(): void {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { email } = this.requestForm.value;

    this.authService.requestPasswordReset(email).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set(
          'If an account with that email exists, a password reset link has been sent. Please check your inbox.',
        );
      },
      error: () => {
        this.isLoading.set(false);
        // Always show success message to prevent email enumeration
        this.successMessage.set(
          'If an account with that email exists, a password reset link has been sent. Please check your inbox.',
        );
      },
    });
  }

  onResetSubmit(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const { newPassword } = this.resetForm.value;

    this.authService.confirmPasswordReset(this.resetToken, newPassword).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.successMessage.set('Password reset successfully! Redirecting to login...');
        setTimeout(() => this.router.navigate(['/login']), 2000);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading.set(false);
        if (error.error?.message) {
          this.errorMessage.set(error.error.message);
        } else {
          this.errorMessage.set('Failed to reset password. The link may have expired.');
        }
      },
    });
  }
}
