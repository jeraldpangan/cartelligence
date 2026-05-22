import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../auth/auth.service';
import { CartService } from '../../cart/cart.service';
import { ChatbotService, ChatMessage } from '../../core/chatbot.service';
import { UserRole } from '@shared/enums';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    ReactiveFormsModule,
    MatToolbarModule,
    MatIconModule,
    MatBadgeModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit {
  cartItemCount = input<number>(0);
  logoFailed = signal(false);

  // Chatbot State
  isChatOpen = signal(false);
  isLoading = signal(false);
  messages = signal<any[]>([
    {
      role: 'model',
      parts: "Hello! I'm Chatelligence. I'm here to help you find the perfect match for your workspace. What kind of electronics or tech essentials are you looking for today?",
    },
    {
      role: 'model',
      parts: "To narrow things down, what's your preferred style or requirement for your new tech?",
    }
  ]);

  activeTab = signal<'assistant' | 'review'>('assistant');
  selectedStyle = signal<string>('Minimalist');
  selectedBudget = signal<string>('₱100 - ₱500');

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cartService = inject(CartService);
  private readonly chatbotService = inject(ChatbotService);

  searchControl = new FormControl('');
  chatControl = new FormControl('');

  ngOnInit(): void {
    // Sync search control with URL query param if present
    const url = new URL(window.location.href);
    const q = url.searchParams.get('q');
    if (q) {
      this.searchControl.setValue(q, { emitEvent: false });
    }

    // Load cart initially to ensure accurate badge counts
    if (this.isBuyer) {
      this.cartService.getCart().subscribe({
        error: (err) => console.warn('[Header] Failed to fetch initial cart:', err),
      });
    }
  }

  get isSeller(): boolean {
    return this.authService.getUserRole() === UserRole.Seller;
  }

  get isBuyer(): boolean {
    return this.authService.getUserRole() === UserRole.Buyer;
  }

  triggerSearch(): void {
    const query = (this.searchControl.value || '').trim();
    if (query) {
      this.router.navigate(['/catalog'], { queryParams: { q: query } });
    } else {
      this.router.navigate(['/catalog']);
    }
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  // AI Chatbot Event Handlers
  toggleChat(): void {
    this.isChatOpen.update((prev) => !prev);
    if (this.isChatOpen()) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  sendMessage(messageText?: string): void {
    const text = (messageText || this.chatControl.value || '').trim();
    if (!text) return;

    // Reset input
    if (!messageText) {
      this.chatControl.setValue('');
    }

    // Append user message
    const userMsg = { role: 'user', parts: text };
    this.messages.update((prev) => [...prev, userMsg]);
    this.isLoading.set(true);

    setTimeout(() => this.scrollToBottom(), 50);

    // Map current messages to service expectations
    const history: ChatMessage[] = this.messages()
      .slice(0, -1) // Exclude the message we just added
      .map((msg) => ({
        role: msg.role,
        parts: msg.parts,
      }));

    this.chatbotService.sendMessage(text, history).subscribe({
      next: (res) => {
        this.messages.update((prev) => [
          ...prev,
          {
            role: 'model',
            parts: res.message,
            products: res.products,
            orders: res.orders,
          },
        ]);
        this.isLoading.set(false);
        setTimeout(() => this.scrollToBottom(), 50);
      },
      error: (err) => {
        console.error('[HeaderChat] Error sending chatbot message:', err);
        this.messages.update((prev) => [
          ...prev,
          {
            role: 'model',
            parts:
              'Sorry, I had trouble connecting to the Cartelligence AI service. Please verify your connection or try again!',
          },
        ]);
        this.isLoading.set(false);
        setTimeout(() => this.scrollToBottom(), 50);
      },
    });
  }

  selectQuickChip(chipText: string): void {
    this.sendMessage(chipText);
  }

  selectStyle(style: string): void {
    this.selectedStyle.set(style);
    this.sendMessage(style);
  }

  selectBudget(budget: string): void {
    this.selectedBudget.set(budget);
    this.sendMessage(budget);
  }

  addToCartFromChat(product: any): void {
    product.adding = true;
    this.cartService.addItem(product.id, 1).subscribe({
      next: () => {
        product.adding = false;
        product.added = true;
        setTimeout(() => {
          product.added = false;
        }, 2000);
      },
      error: (err) => {
        product.adding = false;
        console.error('[HeaderChat] Failed to add item to cart:', err);
      },
    });
  }

  formatPrice(amount: number): string {
    return this.cartService.formatPrice(amount);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatStatus(status: string): string {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private scrollToBottom(): void {
    const container = document.querySelector('.chat-messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}


