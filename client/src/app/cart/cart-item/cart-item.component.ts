import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CartItem } from '@shared/interfaces';
import { CartService } from '../cart.service';

@Component({
  selector: 'app-cart-item',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatButtonModule],
  templateUrl: './cart-item.component.html',
  styleUrl: './cart-item.component.scss',
})
export class CartItemComponent {
  @Input({ required: true }) item!: CartItem;
  @Output() quantityChanged = new EventEmitter<{ itemId: string; quantity: number }>();
  @Output() itemRemoved = new EventEmitter<string>();

  constructor(private readonly cartService: CartService) {}

  increment(): void {
    if (this.item.quantity < 99) {
      this.quantityChanged.emit({
        itemId: this.item.id,
        quantity: this.item.quantity + 1,
      });
    }
  }

  decrement(): void {
    if (this.item.quantity <= 1) {
      this.itemRemoved.emit(this.item.id);
    } else {
      this.quantityChanged.emit({
        itemId: this.item.id,
        quantity: this.item.quantity - 1,
      });
    }
  }

  onQuantityInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);

    if (isNaN(value) || value <= 0) {
      this.itemRemoved.emit(this.item.id);
      return;
    }

    if (value > 99) {
      value = 99;
      input.value = '99';
    }

    this.quantityChanged.emit({ itemId: this.item.id, quantity: value });
  }

  formatPrice(amount: number): string {
    return this.cartService.formatPrice(amount);
  }
}
