import { Component, Input } from '@angular/core';
import { CostBreakdown } from '@shared/interfaces';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-cost-breakdown',
  standalone: true,
  imports: [],
  templateUrl: './cost-breakdown.component.html',
  styleUrl: './cost-breakdown.component.scss',
})
export class CostBreakdownComponent {
  @Input({ required: true }) costBreakdown!: CostBreakdown;

  constructor(private readonly cartService: CartService) {}

  formatPrice(amount: number): string {
    return this.cartService.formatPrice(amount);
  }
}
