import mongoose from 'mongoose';
import BundleCategoryVariant from '../models/BundleCategoryVariant.js';

/**
 * Get bundle rule for a product variant (productId + variantId). Variant-specific.
 * @returns {Promise<{ ruleQuantity: number, ruleDiscountAmount: number } | null>}
 */
export async function getBundleRule(productId, variantId) {
  if (!productId || variantId == null || String(variantId).trim() === '') return null;
  let pid = productId;
  if (typeof pid === 'string' && mongoose.Types.ObjectId.isValid(pid)) {
    pid = new mongoose.Types.ObjectId(pid);
  }
  const bcv = await BundleCategoryVariant.findOne({ productId: pid, variantId: String(variantId).trim() }).lean();
  if (!bcv) return null;
  return {
    ruleQuantity: bcv.ruleQuantity,
    ruleDiscountAmount: bcv.ruleDiscountAmount ?? 0
  };
}

/**
 * Compute line total with optional bundle rule (tiered: first ruleQuantity units discounted, rest at full price).
 * @param {number} unitPrice - Original price per unit
 * @param {number} quantity - Number of units
 * @param {{ ruleQuantity: number, ruleDiscountAmount: number } | null} rule
 * @returns {{ originalLineTotal: number, effectiveLineTotal: number, savings: number, bundleApplied: boolean, discountedUnits?: number, fullPriceUnits?: number }}
 */
export function computeLineWithBundle(unitPrice, quantity, rule) {
  const originalLineTotal = unitPrice * quantity;
  if (!rule || quantity < rule.ruleQuantity) {
    return {
      originalLineTotal,
      effectiveLineTotal: originalLineTotal,
      savings: 0,
      bundleApplied: false
    };
  }
  const discountedUnits = Math.min(quantity, rule.ruleQuantity);
  const fullPriceUnits = quantity - discountedUnits;
  const discountedPricePerUnit = Math.max(0, unitPrice - (rule.ruleDiscountAmount ?? 0));
  const effectiveLineTotal = discountedUnits * discountedPricePerUnit + fullPriceUnits * unitPrice;
  const savings = originalLineTotal - effectiveLineTotal;
  return {
    originalLineTotal,
    effectiveLineTotal,
    savings,
    bundleApplied: true,
    discountedUnits,
    fullPriceUnits,
    ruleQuantity: rule.ruleQuantity,
    ruleDiscountAmount: rule.ruleDiscountAmount ?? 0
  };
}
