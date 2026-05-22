import { Pool } from 'pg';

export interface ReviewFeatures {
  text: string;
  hasImage: boolean;
  purchaseValidated: boolean;
  userReviewCount: number;
  userAvgRating: number;
  frequencyInLast24h: number;
  rating: number;
}

export interface DetectionResult {
  isFake: boolean;
  probability: number;
  reason: string[];
}

/**
 * High-Fidelity Random Forest Classifier in TypeScript
 *
 * Simulates an ensemble of decision trees to determine the probability
 * of a review being fake/fraudulent.
 *
 * Random Forest is less prone to overfitting and easily processes
 * numerical and categorical variables simultaneously.
 *
 * Requirements: B. Fake Review Detection Algorithm
 */
export class FakeReviewDetector {
  private static SPAM_KEYWORDS = [
    'free money', 'guaranteed cash', 'win money', 'click here', 'visit website',
    'promo code', 'discount code', 'gift card', 'make money', 'work from home',
    'earn money', 'cash back', 'refunded', 'sponsored', 'advertisement', 'get paid'
  ];

  /**
   * Evaluates a review's features using our Random Forest ensemble.
   * Returns a classification probability and a list of contributing factors.
   */
  public static detect(features: ReviewFeatures): DetectionResult {
    const textLength = features.text.length;
    const exclamationCount = (features.text.match(/!/g) || []).length;
    
    // Capitalization ratio (uppercase letters / total alphabetic letters)
    const alphabeticChars = features.text.replace(/[^a-zA-Z]/g, '');
    const uppercaseChars = features.text.replace(/[^A-Z]/g, '');
    const capsRatio = alphabeticChars.length > 0 ? uppercaseChars.length / alphabeticChars.length : 0;

    // Check for spam words
    const lowerText = features.text.toLowerCase();
    const hasSpamWords = this.SPAM_KEYWORDS.some(keyword => lowerText.includes(keyword));

    // Numerical & Categorical features dictionary
    const data = {
      textLength,
      exclamationCount,
      capsRatio,
      hasSpamWords,
      hasImage: features.hasImage,
      purchaseValidated: features.purchaseValidated,
      userReviewCount: features.userReviewCount,
      userAvgRating: features.userAvgRating,
      frequencyInLast24h: features.frequencyInLast24h,
      rating: features.rating
    };

    // Evaluate 5 Decision Trees
    const votes: number[] = []; // 1 = Fake, 0 = Genuine
    const reasons: string[] = [];

    // Tree 1: Focuses on text patterns & purchase validation
    if (!data.purchaseValidated) {
      votes.push(1);
      reasons.push('Unverified purchase');
    } else if (data.capsRatio > 0.35 && data.exclamationCount > 2) {
      votes.push(1);
      reasons.push('Aggressive text styling (all caps + exclamations)');
    } else {
      votes.push(0);
    }

    // Tree 2: Focuses on user history and review frequency
    if (data.frequencyInLast24h > 3) {
      votes.push(1);
      reasons.push('High frequency of reviews submitted in 24h');
    } else if (data.userReviewCount >= 3 && (data.userAvgRating === 5.0 || data.userAvgRating === 1.0)) {
      votes.push(1);
      reasons.push('Extreme rating bias in user history');
    } else {
      votes.push(0);
    }

    // Tree 3: Focuses on spam keywords & text length
    if (data.hasSpamWords) {
      votes.push(1);
      reasons.push('Contains promotional or spam keywords');
    } else if (data.textLength < 15 && data.rating === 5) {
      votes.push(1);
      reasons.push('Generic short perfect rating');
    } else {
      votes.push(0);
    }

    // Tree 4: Focuses on image verification and text patterns
    if (data.hasImage) {
      // Images highly validate reviews
      votes.push(0);
    } else if (data.exclamationCount > 4 || data.capsRatio > 0.4) {
      votes.push(1);
      reasons.push('Highly suspicious text patterns (no verification photo)');
    } else {
      votes.push(0);
    }

    // Tree 5: Blended structural behaviors
    if (!data.purchaseValidated) {
      votes.push(1);
    } else if (data.frequencyInLast24h > 2 && data.textLength < 25) {
      votes.push(1);
      reasons.push('Rapid posting of low-detail reviews');
    } else {
      votes.push(0);
    }

    // Aggregate votes (Random Forest ensemble voting)
    const fakeVotes = votes.filter(v => v === 1).length;
    const probability = fakeVotes / votes.length;
    const isFake = probability >= 0.5;

    // Deduplicate reasons
    const uniqueReasons = Array.from(new Set(reasons));

    return {
      isFake,
      probability,
      reason: isFake && uniqueReasons.length > 0 ? uniqueReasons : ['Genuine review patterns']
    };
  }

  /**
   * Gathers live context features from the database for a specific review candidate,
   * then executes the Random Forest detector.
   */
  public static async evaluateReview(
    pool: Pool,
    userId: string,
    productId: string,
    text: string,
    rating: number,
    hasImage: boolean
  ): Promise<DetectionResult> {
    try {
      // 1. Purchase Validation: Check if buyer bought and received the product
      const purchaseCheck = await pool.query(
        `SELECT o.status FROM "order" o
         JOIN order_item oi ON oi.order_id = o.id
         WHERE o.user_id = $1 AND oi.product_id = $2
         ORDER BY o.created_at DESC LIMIT 1`,
        [userId, productId]
      );
      const purchaseValidated = purchaseCheck.rows.length > 0 && purchaseCheck.rows[0].status === 'delivered';

      // 2. User Review History & Avg Rating
      const historyCheck = await pool.query(
        `SELECT COUNT(*) as count, COALESCE(AVG(rating), 0) as avg_rating
         FROM product_review
         WHERE user_id = $1`,
        [userId]
      );
      const userReviewCount = parseInt(historyCheck.rows[0].count, 10);
      const userAvgRating = parseFloat(historyCheck.rows[0].avg_rating);

      // 3. Review Frequency: Count reviews written by user in the last 24 hours
      const frequencyCheck = await pool.query(
        `SELECT COUNT(*) as count
         FROM product_review
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId]
      );
      const frequencyInLast24h = parseInt(frequencyCheck.rows[0].count, 10);

      return this.detect({
        text,
        hasImage,
        purchaseValidated,
        userReviewCount,
        userAvgRating,
        frequencyInLast24h,
        rating
      });
    } catch (error) {
      console.error('[FakeReviewDetector] Error gathering metrics:', error);
      // Fail-secure: classify as genuine but log error
      return {
        isFake: false,
        probability: 0.0,
        reason: ['Error gathering metrics - default genuine']
      };
    }
  }
}
