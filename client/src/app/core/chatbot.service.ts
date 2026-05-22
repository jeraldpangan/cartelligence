import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ChatMessage {
  role: 'user' | 'model';
  parts: string;
}

export interface ChatbotResponse {
  message: string;
  products?: any[];
  orders?: any[];
}

@Injectable({
  providedIn: 'root',
})
export class ChatbotService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/v1/chatbot';

  /**
   * Sends a chat message to the server-side shopping assistant.
   */
  sendMessage(message: string, history: ChatMessage[] = []): Observable<ChatbotResponse> {
    return this.http
      .post<{ data: ChatbotResponse }>(`${this.apiUrl}/message`, {
        message,
        history,
      })
      .pipe(map((res) => res.data));
  }
}
