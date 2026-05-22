import { Pool } from 'pg';
import { getDatabasePool } from '../config/database';
import { OrderStatus, ProductCategory } from '@shared/enums';
import { RecommendationService } from './recommendation.service';

export interface ChatBotMessage {
  role: 'user' | 'model';
  parts: string;
}

export interface ChatBotResponse {
  message: string;
  products?: any[];
  orders?: any[];
}

export class ChatbotService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getDatabasePool();
  }

  /**
   * Generates a context-aware response to the user's message.
   */
  async generateResponse(
    userId: string,
    userMessage: string,
    history: ChatBotMessage[] = [],
  ): Promise<ChatBotResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    const isApiKeyConfigured = apiKey && apiKey !== 'your-gemini-api-key-here' && apiKey.trim().length > 4;

    if (isApiKeyConfigured) {
      try {
        const systemPrompt = `You are a helpful e-commerce shopping assistant for Cartelligence.
Analyze the user's latest query, and classify their intent into one of these: 'product_search', 'order_tracking', 'sales_info', or 'general'.
If they are searching for products, extract ONLY the core single noun keyword (e.g. "milk", "apple", "baby"). NEVER include generic words like "items", "stuff", "products", or "things". Keep it to the absolute most basic singular noun.
Write a warm, conversational, friendly response to introduce what you are doing (e.g., "Certainly! Let me check our fresh catalogue for organic apples...").
Return your response strictly in JSON format matching this schema:
{
  "intent": "product_search" | "order_tracking" | "sales_info" | "general",
  "keyword": string or null,
  "conversationalReply": string
}`;

        // Map ChatBotMessage history to Gemini beta REST API contents format
        const contents = history.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.parts }]
        }));

        // Append the latest user query
        contents.push({
          role: 'user',
          parts: [{ text: userMessage }]
        });

        // Call Google Gemini 3.1 Flash-Lite REST endpoint (fast, stable, and covered in user's quota)
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents,
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              },
              generationConfig: {
                responseMimeType: 'application/json'
              }
            })
          }
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (jsonText) {
            const aiResult = JSON.parse(jsonText.trim());
            const intent = aiResult.intent;
            const keyword = aiResult.keyword;
            const reply = aiResult.conversationalReply;

            // Route based on Gemini's classified intent
            if (intent === 'product_search') {
              const dbResult = await this.handleProductSearch(keyword || userMessage, userId);
              return {
                message: `${reply}\n\n${dbResult.message}`,
                products: dbResult.products
              };
            } else if (intent === 'order_tracking') {
              const dbResult = await this.handleOrderTracking(userId);
              return {
                message: `${reply}\n\n${dbResult.message}`,
                orders: dbResult.orders
              };
            } else if (intent === 'sales_info') {
              const dbResult = await this.handleSalesInfo();
              return {
                message: `${reply}\n\n${dbResult.message}`
              };
            } else {
              return {
                message: reply
              };
            }
          }
        } else {
          console.warn('[ChatbotService] Gemini API call returned status:', response.status);
        }
      } catch (err) {
        console.error('[ChatbotService] Error calling Gemini API, falling back to rule-based:', err);
      }
    }

    // --- GRACEFUL LOCAL BACKUP (Rule-Based Keyword Matching) ---
    const text = userMessage.trim().toLowerCase();

    // 1. Order Status & Tracking Queries
    if (
      text.includes('order') ||
      text.includes('track') ||
      text.includes('status') ||
      text.includes('delivery') ||
      text.includes('where is my')
    ) {
      return this.handleOrderTracking(userId);
    }

    // 2. Product Recommendations & Catalogue Searching Queries
    if (
      text.includes('recommend') ||
      text.includes('search') ||
      text.includes('find') ||
      text.includes('buy') ||
      text.includes('do you have') ||
      text.includes('suggest') ||
      text.includes('organic') ||
      text.includes('fresh') ||
      text.includes('old') ||
      text.includes('new') ||
      text.includes('latest') ||
      this.containsProductKeywords(text)
    ) {
      return this.handleProductSearch(text, userId);
    }

    // 3. Flash Sale & Voucher/Coupon Queries
    if (
      text.includes('sale') ||
      text.includes('discount') ||
      text.includes('voucher') ||
      text.includes('coupon') ||
      text.includes('promo') ||
      text.includes('flash')
    ) {
      return this.handleSalesInfo();
    }

    // 4. Greetings
    if (
      text === 'hi' ||
      text === 'hello' ||
      text.startsWith('hey') ||
      text.includes('who are you') ||
      text.includes('greetings')
    ) {
      return {
        message:
          "Hello! I am your Cartelligence AI Shopping Assistant. 🤖\n\nI can help you search our premium organic catalog, suggest delicious products, and track your active order deliveries in real-time. Try clicking one of the quick suggestions above or ask me a question!",
      };
    }

    return {
      message:
        "I'm here to help you get the best out of Cartelligence! 🛒\n\n- To search for items, ask me something like: *\"Do you have fresh apples?\"* or *\"Recommend snacks\"*.\n- To check your deliveries, ask: *\"Where is my order?\"*.\n- To check active discounts, ask: *\"Show me vouchers\"*.\n\nWhat would you like to explore today?",
    };
  }


  /**
   * Queries user's active orders and formats a tracking response.
   */
  private async handleOrderTracking(userId: string): Promise<ChatBotResponse> {
    try {
      const result = await this.pool.query(
        `SELECT o.id, o.order_number, o.status as order_status, o.grand_total, o.created_at,
                d.status as delivery_status, d.estimated_delivery_time
         FROM "order" o
         LEFT JOIN delivery d ON o.id = d.order_id
         WHERE o.buyer_id = $1
         ORDER BY o.created_at DESC
         LIMIT 3`,
        [userId],
      );

      if (result.rows.length === 0) {
        return {
          message:
            "I checked our records, but it looks like you haven't placed any orders yet! 📦\n\nOnce you check out items from your cart, you can ask me to track them here anytime.",
        };
      }

      const orders = result.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        deliveryStatus: row.delivery_status || 'Pending',
        grandTotal: parseFloat(row.grand_total),
        createdAt: row.created_at,
        estimatedDeliveryTime: row.estimated_delivery_time,
      }));

      const activeOrder = orders.find(
        (o) =>
          o.orderStatus !== OrderStatus.Delivered &&
          o.orderStatus !== OrderStatus.Cancelled,
      );

      let message = '';
      if (activeOrder) {
        message = `I found your active order **#${activeOrder.orderNumber}**! 🚀\n\n- **Order Status:** ${this.formatStatus(activeOrder.orderStatus)}\n- **Delivery Status:** ${this.formatStatus(activeOrder.deliveryStatus)}\n- **Total Amount:** $${activeOrder.grandTotal.toFixed(2)}\n\n`;
        if (activeOrder.estimatedDeliveryTime) {
          const eta = new Date(activeOrder.estimatedDeliveryTime).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          message += `🕒 **Estimated Delivery:** Today around **${eta}**.\n\n`;
        }
        message += "I'll keep a close eye on it for you! You can also view its details inside the tracking panel.";
      } else {
        const lastOrder = orders[0];
        message = `Your most recent order was **#${lastOrder.orderNumber}**, placed on ${new Date(
          lastOrder.createdAt,
        ).toLocaleDateString()}.\n\n- **Order Status:** ${this.formatStatus(lastOrder.orderStatus)}\n- **Delivery Status:** ${this.formatStatus(lastOrder.deliveryStatus)}\n- **Total Amount:** $${lastOrder.grandTotal.toFixed(2)}\n\nIf you have any other orders you'd like to check, let me know!`;
      }

      return {
        message,
        orders,
      };
    } catch (error) {
      console.error('[ChatbotService] Error tracking orders:', error);
      return {
        message:
          "I ran into a small hiccup while checking your orders. Please try again in a moment, or visit the orders dashboard page!",
      };
    }
  }

  /**
   * Searches the database for matching products and formats recommendation cards.
   */
  private async handleProductSearch(query: string, userId?: string): Promise<ChatBotResponse> {
    try {
      const lowerQuery = query.toLowerCase();
      const isRecommend = lowerQuery.includes('recommend') || lowerQuery.includes('suggest') || lowerQuery.includes('for me');
      const isOldestSelected = lowerQuery.includes('oldest') || lowerQuery.includes('old');
      const isNewestSelected = lowerQuery.includes('newest') || lowerQuery.includes('new') || lowerQuery.includes('latest');

      // Use Hybrid Recommendation if user is authenticated and queries for recommendations/suggestions
      if (userId && (isRecommend || query === 'organic' || query === 'snacks')) {
        const recService = new RecommendationService(this.pool);
        const survey = await recService.getUserSurvey(userId);
        const hybridRes = await recService.getHybridRecommendations(userId, 4);

        if (hybridRes.products && hybridRes.products.length > 0) {
          const budgetMsg = survey 
            ? `tailored perfectly to your survey weekly budget of **$${survey.budget}** and preferences 🛒`
            : `curated based on our premium popular grocery arrivals 🌟`;

          const products = hybridRes.products.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            unitPrice: p.unitPrice,
            unit: p.unit,
            description: p.description,
            stockQuantity: p.stockQuantity
          }));

          return {
            message: `I have compiled these high-accuracy hybrid recommendations for you, ${budgetMsg}:`,
            products
          };
        }
      }

      if (isOldestSelected || isNewestSelected) {
        // Query the newest 10 products globally
        const result = await this.pool.query(
          `SELECT * FROM product
           WHERE is_available = true
           ORDER BY created_at DESC
           LIMIT 10`
        );

        let products = result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          unitPrice: parseFloat(row.unit_price),
          unit: row.unit,
          description: row.description || '',
          stockQuantity: row.stock_quantity,
        }));

        if (isOldestSelected) {
          // Take bottom when oldest is selected (e.g. the oldest 4 products of the 10 newest arrivals)
          products = products.slice(-4);
          return {
            message: `Here are some of our established and time-tested favorites from the latest arrivals! 🕰️`,
            products,
          };
        } else {
          // Take top 4 elements for newest
          products = products.slice(0, 4);
          return {
            message: `Check out our fresh, newly added arrivals in the catalogue! 🆕`,
            products,
          };
        }
      }

      // Clean query text of search filler phrases
      let keyword = query
        .replace(/search for/g, '')
        .replace(/find me/g, '')
        .replace(/do you have/g, '')
        .replace(/recommend/g, '')
        .replace(/suggest/g, '')
        .replace(/show me/g, '')
        .replace(/please/g, '')
        .replace(/items/gi, '')
        .replace(/products/gi, '')
        .replace(/stuff/gi, '')
        .trim();

      // Default category/generic fallbacks if empty keyword
      if (!keyword || keyword.length < 2) {
        keyword = 'organic';
      }

      // Split into individual valid words for a smarter OR search
      const tokens = keyword.split(/\s+/).filter((t) => t.length > 2);
      if (tokens.length === 0) tokens.push(keyword);

      const conditions: string[] = [];
      const params: any[] = [];

      tokens.forEach((token, index) => {
        const paramIdx = index + 1;
        conditions.push(
          `(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR category::text ILIKE $${paramIdx})`
        );
        params.push(`%${token}%`);
      });

      const whereClause = conditions.join(' OR ');

      const result = await this.pool.query(
        `SELECT * FROM product
         WHERE (${whereClause})
           AND is_available = true
         ORDER BY stock_quantity DESC, name ASC
         LIMIT 5`,
        params,
      );

      if (result.rows.length === 0) {
        // Fallback to general premium products if query yielded nothing
        const fallbackResult = await this.pool.query(
          `SELECT * FROM product
           WHERE is_available = true
           ORDER BY created_at DESC
           LIMIT 4`,
        );

        const fallbacks = fallbackResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          unitPrice: parseFloat(row.unit_price),
          unit: row.unit,
          description: row.description || '',
          stockQuantity: row.stock_quantity,
        }));

        return {
          message: `I couldn't find anything matching **"${keyword}"** in our catalogue. 🍎\n\nHowever, here are some of our popular, fresh options that our buyers are absolutely loving right now:`,
          products: fallbacks,
        };
      }

      const products = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        unitPrice: parseFloat(row.unit_price),
        unit: row.unit,
        description: row.description || '',
        stockQuantity: row.stock_quantity,
      }));

      return {
        message: `I found some premium options matching **"${keyword}"**! 🥬\n\nWould you like me to add any of these fresh items to your cart?`,
        products,
      };
    } catch (error) {
      console.error('[ChatbotService] Error searching products:', error);
      return {
        message:
          "I experienced a slight technical issue searching the product catalog. Please feel free to search using the top global search bar!",
      };
    }
  }

  /**
   * Formats active sales and coupon details.
   */
  private handleSalesInfo(): ChatBotResponse {
    return {
      message:
        "⚡ **Active Vouchers & Campaigns** ⚡\n\nWe have amazing offers running right now to help you save big:\n\n1. **Flash Sale Campaign**: Enjoy up to **50% off** select categories. Organic produce and fresh meat are currently marked down!\n2. **CART15**: Save an extra **15% off** your entire cart. Enter coupon code **`CART15`** on the Checkout page!\n3. **Free Delivery**: All orders above **$50.00** receive free premium delivery slots.\n\nBrowse the Flash Sales in the catalog page or ask me to recommend some discounted snacks!",
    };
  }

  /**
   * Helper to check if user text contains typical grocery categories or items.
   */
  private containsProductKeywords(text: string): boolean {
    const keywords = [
      'apple',
      'milk',
      'banana',
      'cheese',
      'bread',
      'meat',
      'chicken',
      'juice',
      'soda',
      'snack',
      'chip',
      'cookie',
      'vegetable',
      'fruit',
      'beverage',
      'egg',
      'butter',
      'produce',
      'dairy',
      'beef',
      'pork',
    ];
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * Helper to prettify order or delivery statuses.
   */
  private formatStatus(status: string): string {
    return status
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
