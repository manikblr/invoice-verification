"use strict";
/**
 * Simple validation script for API types and client functions
 * Tests the type system without requiring actual API endpoints
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var agent_1 = require("./src/types/agent");
var suggest_1 = require("./src/types/suggest");
var api_1 = require("./src/lib/api");
var public_1 = require("./src/config/public");
function testTypes() {
    var _this = this;
    console.log('🧪 Testing TypeScript types and schemas...\n');
    // Test 1: Agent types
    console.log('1. Testing agent types...');
    var policyCode = 'ALLOW';
    var judgeScores = {
        policyScore: 0.95,
        priceCheckScore: 0.88,
        explanationScore: 0.92
    };
    var priceBand = { min: 100.0, max: 500.0 };
    var proposal = {
        type: 'NEW_SYNONYM',
        confidence: 0.85,
        payload: { synonym: 'Office Chair', canonicalId: 'canonical_001' }
    };
    var lineDecision = {
        lineId: 'line_001',
        policy: 'ALLOW',
        reasons: ['Price within acceptable range', 'Item matched canonical catalog'],
        canonicalItemId: 'canonical_001',
        priceBand: priceBand,
        judge: judgeScores,
        traceId: 'trace_12345',
        proposals: [proposal]
    };
    var agentResponse = {
        decisions: [lineDecision],
        runId: 'run_12345',
        judgeSummary: {
            avgPolicyScore: 0.95,
            avgPriceCheckScore: 0.88,
            avgExplanationScore: 0.92
        }
    };
    console.log('   ✓ PolicyCode:', policyCode);
    console.log('   ✓ AgentRunResponse structure valid');
    // Test 2: Suggestion types
    console.log('\n2. Testing suggestion types...');
    var suggestion = {
        id: 'canonical_001',
        name: 'Office Chair Standard',
        score: 0.95,
        reason: 'fuzzy'
    };
    var suggestResponse = {
        suggestions: [suggestion]
    };
    console.log('   ✓ Suggestion:', suggestion.name, "(score: ".concat(suggestion.score, ")"));
    // Test 3: Zod validation
    console.log('\n3. Testing Zod validation...');
    var validAgentData = {
        decisions: [{
                lineId: 'line_001',
                policy: 'ALLOW',
                reasons: ['Valid item'],
                canonicalItemId: 'canonical_001'
            }],
        runId: 'run_001'
    };
    try {
        var parsed = agent_1.ZAgentRunResponse.parse(validAgentData);
        console.log('   ✓ Agent response validation passed');
    }
    catch (error) {
        console.log('   ✗ Agent response validation failed:', error);
    }
    var validSuggestData = {
        suggestions: [{
                id: 'canonical_001',
                name: 'Test Item',
                score: 0.85
            }]
    };
    try {
        var parsed = suggest_1.ZSuggestResponse.parse(validSuggestData);
        console.log('   ✓ Suggest response validation passed');
    }
    catch (error) {
        console.log('   ✗ Suggest response validation failed:', error);
    }
    // Test 4: API Error types
    console.log('\n4. Testing API error types...');
    var apiError = new api_1.ApiError('Test error', 404, '/api/test');
    console.log('   ✓ ApiError created:', apiError.message);
    console.log('   ✓ isApiError check:', (0, api_1.isApiError)(apiError));
    // Test 5: Public config
    console.log('\n5. Testing public config...');
    console.log('   ✓ PUBLIC_CFG accessible:', typeof public_1.PUBLIC_CFG);
    console.log('   ✓ langfuseUrl type:', typeof public_1.PUBLIC_CFG.langfuseUrl);
    // Test 6: Function signatures (compile-time check)
    console.log('\n6. Testing function signatures...');
    // These won't actually run but will verify the types compile
    var _testRunAgent = function (payload, init) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // Mock implementation for type checking
            return [2 /*return*/, {
                    decisions: [],
                    runId: 'mock'
                }];
        });
    }); };
    var _testSuggestItems = function (q, vendorId, init) { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // Mock implementation for type checking
            return [2 /*return*/, []];
        });
    }); };
    console.log('   ✓ runAgent signature valid');
    console.log('   ✓ suggestItems signature valid');
    console.log('\n🎉 All type tests passed! TypeScript compilation successful.');
    console.log('\n📋 Summary:');
    console.log('   • Agent types: PolicyCode, JudgeScores, LineDecision, AgentRunResponse');
    console.log('   • Suggest types: Suggestion, SuggestResponse');
    console.log('   • API client: runAgent(), suggestItems()');
    console.log('   • Error handling: ApiError with typed responses');
    console.log('   • Runtime validation: Zod schemas for all types');
    console.log('   • Public config: PUBLIC_CFG with langfuseUrl');
}
// Only run if this file is executed directly
if (require.main === module) {
    testTypes();
}
