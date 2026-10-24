import { test, describe } from 'node:test';
import assert from 'node:assert';
import { calculateCapitalAllocation } from '../src/services/trading/riskGuard.js';
import { whatsappService } from '../src/services/whatsapp/index.js';
import { getSetting, setSetting } from '../src/db/index.js';

describe('Capital Allocation & Auto-Set Engine', () => {
  test('strictly enforces Indodax minimum trade threshold of Rp 10.000 for tiny capital', () => {
    // If someone inputs Rp 15.000
    const plan = calculateCapitalAllocation(15000, 'conservative');

    assert.strictEqual(plan.capitalIdr, 15000);
    assert.strictEqual(plan.maxAllocationPerTradeIdr, 10000);
    assert.strictEqual(plan.maxActiveTrades, 1);
    assert.strictEqual(plan.totalCommitmentIdr, 10000);
    assert.strictEqual(plan.cashBufferIdr, 5000);
    assert.ok(plan.notes.some((n) => n.includes('10.000')));
  });

  test('proportional sizing for Rp 100.000 modal across all 3 risk profiles', () => {
    // 1. Conservative
    const cons = calculateCapitalAllocation(100000, 'conservative');
    assert.strictEqual(cons.maxAllocationPerTradeIdr, 20000); // 20%
    assert.strictEqual(cons.maxActiveTrades, 2);
    assert.strictEqual(cons.totalCommitmentIdr, 40000);
    assert.strictEqual(cons.cashBufferIdr, 60000); // 60% cash buffer
    assert.strictEqual(cons.trailingStopPercent, 1.8);
    assert.strictEqual(cons.takeProfitStep1Percent, 3.5);

    // 2. Balanced
    const bal = calculateCapitalAllocation(100000, 'balanced');
    assert.strictEqual(bal.maxAllocationPerTradeIdr, 30000); // 30%
    assert.strictEqual(bal.maxActiveTrades, 3);
    assert.strictEqual(bal.totalCommitmentIdr, 90000);
    assert.strictEqual(bal.cashBufferIdr, 10000); // 10% cash buffer
    assert.strictEqual(bal.trailingStopPercent, 2.5);
    assert.strictEqual(bal.takeProfitStep1Percent, 5.0);

    // 3. Aggressive
    const agg = calculateCapitalAllocation(100000, 'aggressive');
    assert.strictEqual(agg.maxAllocationPerTradeIdr, 45000); // 45%
    assert.strictEqual(agg.maxActiveTrades, 2);
    assert.strictEqual(agg.totalCommitmentIdr, 90000);
    assert.strictEqual(agg.cashBufferIdr, 10000);
    assert.strictEqual(agg.trailingStopPercent, 3.5);
    assert.strictEqual(agg.takeProfitStep1Percent, 7.5);
  });

  test('proportional sizing for medium & large modal (Rp 1.000.000 & Rp 10.000.000)', () => {
    const med = calculateCapitalAllocation(1000000, 'balanced');
    assert.strictEqual(med.maxAllocationPerTradeIdr, 300000);
    assert.strictEqual(med.maxActiveTrades, 3);
    assert.strictEqual(med.totalCommitmentIdr, 900000);
    assert.strictEqual(med.cashBufferIdr, 100000);

    const large = calculateCapitalAllocation(10000000, 'conservative');
    assert.strictEqual(large.maxAllocationPerTradeIdr, 2000000);
    assert.strictEqual(large.maxActiveTrades, 3);
    assert.strictEqual(large.totalCommitmentIdr, 6000000);
    assert.strictEqual(large.cashBufferIdr, 4000000);
  });

  test('WhatsApp /modal command correctly parses text and applies capital settings', async () => {
    const adminJid = '6281299998888@s.whatsapp.net';
    setSetting('whatsapp_admin_number', '6281299998888');

    // Test /modal 500k seimbang
    await whatsappService.handleCommand(adminJid, '/modal 500k seimbang', true);

    assert.strictEqual(getSetting('risk_profile'), 'balanced');
    assert.strictEqual(getSetting('paper_idr_balance'), '500000');
    assert.strictEqual(getSetting('max_allocation_per_trade_idr'), '150000');
    assert.strictEqual(getSetting('max_active_trades'), '3');
    assert.strictEqual(getSetting('trailing_stop_percent'), '2.5');
    assert.strictEqual(getSetting('take_profit_target_1_percent'), '5');

    // Test /modal 1jt konservatif
    await whatsappService.handleCommand(adminJid, '/modal 1jt konservatif', true);

    assert.strictEqual(getSetting('risk_profile'), 'conservative');
    assert.strictEqual(getSetting('paper_idr_balance'), '1000000');
    assert.strictEqual(getSetting('max_allocation_per_trade_idr'), '200000');
    assert.strictEqual(getSetting('max_active_trades'), '2');
    assert.strictEqual(getSetting('trailing_stop_percent'), '1.8');
    assert.strictEqual(getSetting('take_profit_target_1_percent'), '3.5');
  });

  test('WhatsApp /modal with arguments is blocked for non-admin users', () => {
    const isDangerous = whatsappService.isDangerousCommand('/modal', ['500000']);
    assert.strictEqual(isDangerous, true);

    const isInfoSafe = whatsappService.isDangerousCommand('/modal', []);
    assert.strictEqual(isInfoSafe, false);
  });
});
