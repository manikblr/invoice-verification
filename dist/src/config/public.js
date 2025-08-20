"use strict";
/**
 * Public configuration accessible in client-side code
 * Only includes environment variables prefixed with NEXT_PUBLIC_
 */
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_CFG = void 0;
/**
 * Public configuration object
 * Safe to use in client-side components and API calls
 */
exports.PUBLIC_CFG = {
    /** Langfuse public URL for trace links and observability */
    langfuseUrl: (_a = process.env.NEXT_PUBLIC_LANGFUSE_URL) !== null && _a !== void 0 ? _a : '',
};
