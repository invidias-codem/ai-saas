"use strict";
/**
 * Distribution Shift Detector — Public API
 * Tech Genie / World Model Layer
 *
 * Re-exports all types and the DistributionShiftDetector class.
 * Use `createDistributionShiftDetector` to obtain an instance.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributionShiftDetector = void 0;
exports.createDistributionShiftDetector = createDistributionShiftDetector;
__exportStar(require("./types"), exports);
var DistributionShiftDetector_1 = require("./DistributionShiftDetector");
Object.defineProperty(exports, "DistributionShiftDetector", { enumerable: true, get: function () { return DistributionShiftDetector_1.DistributionShiftDetector; } });
const DistributionShiftDetector_2 = require("./DistributionShiftDetector");
/**
 * Factory that constructs a DistributionShiftDetector bound to the given
 * Supabase client. Prefer this over `new DistributionShiftDetector()` so
 * callers don't need to import the class directly.
 *
 * @param supabase - Authenticated Supabase client with access to wm_* tables
 * @returns New DistributionShiftDetector instance
 */
function createDistributionShiftDetector(supabase) {
    return new DistributionShiftDetector_2.DistributionShiftDetector(supabase);
}
