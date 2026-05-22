import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LandingPageComponent } from './landing-page.component';

describe('LandingPageComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPageComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the tagline', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.tagline')?.textContent).toContain('Click.Cart. Delivered.');
  });

  it('should display login CTA button', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const loginBtn = compiled.querySelector('.cta-primary');
    expect(loginBtn).toBeTruthy();
    expect(loginBtn?.textContent?.trim()).toBe('Log In');
  });

  it('should display register CTA button', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const registerBtn = compiled.querySelector('.cta-secondary');
    expect(registerBtn).toBeTruthy();
    expect(registerBtn?.textContent?.trim()).toBe('Register');
  });

  it('should have a description paragraph', () => {
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const description = compiled.querySelector('.description');
    expect(description).toBeTruthy();
    expect(description?.textContent?.length).toBeGreaterThan(0);
  });
});
