export interface StructuredNlpSummary {
  summaryText: string;
  productQuality: string;
  sellerCredibility: string;
  customerSatisfaction: string;
}

/**
 * Review Summarizer Service
 *
 * Provides natural language processing (NLP) text summarization to analyze
 * customer feedback and extract insights regarding product quality,
 * seller credibility, and customer satisfaction.
 *
 * Uses Gemini API as the primary advanced summarizer, and falls back to a
 * high-fidelity local rule-based sentiment lexicon parser when Gemini is
 * offline or unconfigured.
 *
 * Requirements: C. Review Summarization Algorithm
 */
export class ReviewSummarizer {
  private static POSITIVE_WORDS = [
    'fresh', 'delicious', 'tasty', 'excellent', 'great', 'fast', 'friendly', 'premium',
    'good', 'satisfied', 'happy', 'love', 'perfect', 'beautiful', 'ripe', 'wonderful',
    'amazing', 'highly', 'recommend', 'nice', 'sweet', 'crisp', 'clean', 'cheap', 'affordable'
  ];

  private static NEGATIVE_WORDS = [
    'bad', 'stale', 'rotten', 'late', 'poor', 'bruised', 'disappointed', 'worst',
    'awful', 'terrible', 'slow', 'dirty', 'unfriendly', 'expensive', 'small', 'hard',
    'sour', 'spoiled', 'disappointment', 'moldy', 'leaking'
  ];

  /**
   * Generates a summarized view from an array of review comments.
   */
  public static async summarize(comments: string[]): Promise<StructuredNlpSummary> {
    if (!comments || comments.length === 0) {
      return {
        summaryText: 'No customer reviews available to summarize yet.',
        productQuality: 'Pending reviews.',
        sellerCredibility: 'Pending reviews.',
        customerSatisfaction: 'Pending reviews.'
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const isApiKeyConfigured = apiKey && apiKey !== 'your-gemini-api-key-here' && apiKey.trim().length > 4;

    if (isApiKeyConfigured) {
      try {
        const prompt = `You are an expert NLP review summarizer for Cartelligence.
Analyze the following list of customer reviews and extract a brief, highly helpful summary of product feedback.
You MUST analyze three categories: Product Quality, Seller Credibility, and Customer Satisfaction.
Return a JSON object conforming strictly to this structure:
{
  "summaryText": "A warm 1-2 sentence overall overview of the customer consensus.",
  "productQuality": "A brief summary sentence specifically detailing the product quality.",
  "sellerCredibility": "A brief summary sentence focusing on seller behavior, delivery, and responsiveness.",
  "customerSatisfaction": "A brief summary sentence about customer delight, recommendations, or disappointments."
}

Here are the customer reviews to analyze:
${comments.map((c, i) => `Review ${i+1}: "${c}"`).join('\n')}`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' }
            })
          }
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (jsonText) {
            return JSON.parse(jsonText.trim()) as StructuredNlpSummary;
          }
        }
      } catch (err) {
        console.warn('[ReviewSummarizer] Gemini summarization failed, falling back to local NLP parser:', err);
      }
    }

    // --- High-Fidelity Local Rule-Based NLP Parser ---
    return this.generateLocalNlpSummary(comments);
  }

  /**
   * Evaluates review comment texts locally using sentiment lexicon matching
   * and sentence categorization.
   */
  private static generateLocalNlpSummary(comments: string[]): StructuredNlpSummary {
    const qualitySentences: string[] = [];
    const sellerSentences: string[] = [];
    const satisfactionSentences: string[] = [];

    let positiveScore = 0;
    let negativeScore = 0;

    // Tokenize comments into sentences
    for (const comment of comments) {
      if (!comment) continue;
      const sentences = comment.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 5);
      
      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        
        // Count sentiment words
        this.POSITIVE_WORDS.forEach(w => {
          if (lowerSentence.includes(w)) positiveScore++;
        });
        this.NEGATIVE_WORDS.forEach(w => {
          if (lowerSentence.includes(w)) negativeScore++;
        });

        // Categorize sentence
        const isQuality = /quality|fresh|stale|taste|good|delicious|bad|rotten|bruised|ripe|sweet|crisp|texture|flavor/.test(lowerSentence);
        const isSeller = /seller|delivery|shipping|delivered|arrived|late|fast|slow|vendor|shop|service|packaging/.test(lowerSentence);
        const isSatisfaction = /satisfied|happy|love|recommend|buy again|disappointed|hate|excellent|perfect|worth/.test(lowerSentence);

        if (isQuality) qualitySentences.push(sentence);
        if (isSeller) sellerSentences.push(sentence);
        if (isSatisfaction) satisfactionSentences.push(sentence);
      }
    }

    // Determine overall sentiment
    const totalSentiment = positiveScore + negativeScore;
    const positivityRate = totalSentiment > 0 ? positiveScore / totalSentiment : 0.8; // Default optimistic

    let summaryText = '';
    let productQuality = '';
    let sellerCredibility = '';
    let customerSatisfaction = '';

    // 1. Overall Consensus
    if (positivityRate >= 0.75) {
      summaryText = 'Customers are highly enthusiastic about this product, praising its freshness, superior flavor, and reliable fulfillment.';
    } else if (positivityRate >= 0.5) {
      summaryText = 'Overall consensus is generally favorable, with most buyers reporting solid product quality despite minor notes on pricing or packing.';
    } else {
      summaryText = 'Feedback is mixed to critical, with several customers raising concerns regarding quality inconsistencies or shipment delays.';
    }

    // 2. Product Quality Synthesis
    const qualityPositivity = this.evaluateSubsetSentiment(qualitySentences);
    if (qualityPositivity >= 0.75) {
      productQuality = 'Outstanding. Buyers consistently celebrate the fresh, ripe, and delicious attributes of the item.';
    } else if (qualityPositivity >= 0.5) {
      productQuality = 'Satisfactory. The product meets grocery expectations, with rare complaints about shape or ripeness.';
    } else {
      productQuality = 'Inconsistent. Some buyers noted items arriving stale, bruised, or lacking expected freshness.';
    }

    // 3. Seller Credibility Synthesis
    const sellerPositivity = this.evaluateSubsetSentiment(sellerSentences);
    if (sellerPositivity >= 0.75) {
      sellerCredibility = 'Highly reliable. Commended for rapid, well-packaged deliveries and exceptional professionalism.';
    } else if (sellerPositivity >= 0.5) {
      sellerCredibility = 'Dependable. Delivery times are generally accurate and items arrive securely sealed.';
    } else {
      sellerCredibility = 'Needs improvement. A few users mentioned slow delivery times or cracked seals on packaging.';
    }

    // 4. Customer Satisfaction Synthesis
    const satisfactionPositivity = this.evaluateSubsetSentiment(satisfactionSentences);
    if (satisfactionPositivity >= 0.75) {
      customerSatisfaction = 'Excellent. The majority of reviewers highly recommend this item and plan on reordering.';
    } else if (satisfactionPositivity >= 0.5) {
      customerSatisfaction = 'Good. Most users are happy with their purchase, considering it decent value for money.';
    } else {
      customerSatisfaction = 'Low. A notable portion of buyers expressed disappointment and would not recommend it.';
    }

    return {
      summaryText,
      productQuality,
      sellerCredibility,
      customerSatisfaction
    };
  }

  /** Helper to count positive/negative words in a collection of sentences */
  private static evaluateSubsetSentiment(sentences: string[]): number {
    if (sentences.length === 0) return 0.75; // Neutral-positive fallback
    let pos = 0;
    let neg = 0;
    for (const s of sentences) {
      const lower = s.toLowerCase();
      this.POSITIVE_WORDS.forEach(w => { if (lower.includes(w)) pos++; });
      this.NEGATIVE_WORDS.forEach(w => { if (lower.includes(w)) neg++; });
    }
    const total = pos + neg;
    return total > 0 ? pos / total : 0.75;
  }
}
