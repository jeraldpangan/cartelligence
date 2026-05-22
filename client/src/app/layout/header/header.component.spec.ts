import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display brand name', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('Cartelligence');
  });

  it('should display navigation links', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const navLinks = compiled.querySelectorAll('.nav-links a');
    const linkTexts = Array.from(navLinks).map((el) => el.textContent?.trim());
    expect(linkTexts).toContain('Home');
    expect(linkTexts).toContain('Shop');
    expect(linkTexts).toContain('Cart');
    expect(linkTexts).toContain('Orders');
  });

  it('should display cart icon', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.cart-icon-link')).toBeTruthy();
  });

  it('should hide badge when cart count is 0', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.componentRef.setInput('cartItemCount', 0);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.mat-badge-hidden');
    expect(badge).toBeTruthy();
  });

  it('should show badge when cart has items', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.componentRef.setInput('cartItemCount', 3);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.mat-badge-content');
    expect(badge?.textContent?.trim()).toBe('3');
  });
});
