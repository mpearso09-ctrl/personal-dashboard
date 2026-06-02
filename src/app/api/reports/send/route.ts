import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { ReportData } from '@/lib/types';

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
}

function formatMonthFull(month: string) {
  const [y, m] = month.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
}

function buildEmailHtml(report: ReportData): string {
  const monthLabel = formatMonthFull(report.month);
  const netPositive = report.netIncome >= 0;
  const nwPositive = report.netWorthChange >= 0;
  const netColor = netPositive ? '#10b981' : '#ef4444';
  const nwColor = nwPositive ? '#10b981' : '#ef4444';

  const verdict = (() => {
    if (netPositive && nwPositive)
      return `Earned more than spent and grew net worth by ${fmtCurrency(Math.abs(report.netWorthChange))}.`;
    if (!netPositive && nwPositive)
      return `Spending exceeded income by ${fmtCurrency(Math.abs(report.netIncome))}, but net worth still grew by ${fmtCurrency(Math.abs(report.netWorthChange))}.`;
    if (netPositive && !nwPositive)
      return `Positive cash flow of ${fmtCurrency(report.netIncome)}, but net worth declined by ${fmtCurrency(Math.abs(report.netWorthChange))}.`;
    return `Spending exceeded income by ${fmtCurrency(Math.abs(report.netIncome))} and net worth declined by ${fmtCurrency(Math.abs(report.netWorthChange))}.`;
  })();

  const budgetRows = report.spendingBreakdown.map((b) => {
    const status = b.variance >= 0 ? '✓' : '✗';
    const varColor = b.variance >= 0 ? '#10b981' : '#ef4444';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;">${b.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:right;">${fmtCurrency(b.budgeted)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:right;">${fmtCurrency(b.actual)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:right;color:${varColor};">${b.variance >= 0 ? '+' : ''}${fmtCurrency(b.variance)} ${status}</td>
    </tr>`;
  }).join('');

  const incomeRows = report.incomeBreakdown.map((i) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #27272a;">${i.name}</td><td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;color:#10b981;">${fmtCurrency(i.amount)}</td></tr>`
  ).join('');

  const cashRows = report.cashAccounts.map((a) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #27272a;">${a.name}</td><td style="padding:6px 12px;border-bottom:1px solid #27272a;text-align:right;">${fmtCurrency(a.balance)}</td></tr>`
  ).join('');

  const totalCash = report.cashAccounts.reduce((s, a) => s + a.balance, 0);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fafafa;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="margin-bottom:32px;">
    <div style="font-size:13px;color:#a1a1aa;margin-bottom:4px;">Pearson Household Financial Report</div>
    <h1 style="margin:0;font-size:28px;font-weight:700;color:#fff;">${monthLabel}${report.isPartial ? ' (Mid-Month)' : ''}</h1>
    <div style="font-size:12px;color:#71717a;margin-top:4px;">Generated ${new Date(report.generatedAt).toLocaleDateString('en-CA', { dateStyle: 'long' })}</div>
  </div>

  <!-- Bottom Line -->
  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">The Bottom Line</div>
    <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px;">
      <div>
        <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Net Income</div>
        <div style="font-size:36px;font-weight:700;color:${netColor};">${netPositive ? '+' : ''}${fmtCurrency(report.netIncome)}</div>
      </div>
      <div>
        <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Net Worth</div>
        <div style="font-size:36px;font-weight:700;color:#fff;">${fmtCurrency(report.netWorthCurrent)}</div>
        <div style="font-size:14px;color:${nwColor};">${nwPositive ? '▲' : '▼'} ${fmtCurrency(Math.abs(report.netWorthChange))} vs last month</div>
      </div>
    </div>
    <div style="background:#09090b;border-radius:8px;padding:12px;font-size:14px;color:#a1a1aa;">${verdict}</div>
  </div>

  <!-- Income vs Spending -->
  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Income vs Spending</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;">
      <div style="flex:1;min-width:140px;text-align:center;background:#09090b;border-radius:8px;padding:16px;">
        <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Money In</div>
        <div style="font-size:24px;font-weight:700;color:#10b981;">${fmtCurrency(report.incomeTotal)}</div>
      </div>
      <div style="flex:1;min-width:140px;text-align:center;background:#09090b;border-radius:8px;padding:16px;">
        <div style="font-size:12px;color:#71717a;margin-bottom:4px;">Money Out</div>
        <div style="font-size:24px;font-weight:700;color:#ef4444;">${fmtCurrency(report.spendingTotal)}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr><th style="text-align:left;padding:8px 12px;color:#71717a;font-weight:500;">Income Source</th><th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Amount</th></tr></thead>
      <tbody>${incomeRows}</tbody>
    </table>
  </div>

  <!-- Budget Performance -->
  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Budget Performance</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th style="text-align:left;padding:8px 12px;color:#71717a;font-weight:500;">Category</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Budgeted</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Actual</th>
        <th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Variance</th>
      </tr></thead>
      <tbody>${budgetRows}</tbody>
    </table>
  </div>

  <!-- Cash Position -->
  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px;margin-bottom:20px;">
    <div style="font-size:12px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;">Cash Position</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr><th style="text-align:left;padding:8px 12px;color:#71717a;font-weight:500;">Account</th><th style="text-align:right;padding:8px 12px;color:#71717a;font-weight:500;">Balance</th></tr></thead>
      <tbody>${cashRows}<tr style="border-top:2px solid #3f3f46;"><td style="padding:10px 12px;font-weight:700;color:#fff;">Total Liquid Cash</td><td style="padding:10px 12px;text-align:right;font-weight:700;color:#fff;">${fmtCurrency(totalCash)}</td></tr></tbody>
    </table>
  </div>

  <div style="text-align:center;font-size:12px;color:#52525b;margin-top:32px;">Pearson Household · Generated by Personal Dashboard</div>
</div>
</body>
</html>`;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reportId, householdId } = await request.json();
  if (!reportId || !householdId) return NextResponse.json({ error: 'Missing reportId or householdId' }, { status: 400 });

  // Check Resend key
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: 'RESEND_API_KEY not configured',
      setupRequired: true,
    }, { status: 503 });
  }

  // Fetch report
  const { data: report, error: rErr } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('id', reportId)
    .eq('household_id', householdId)
    .single();
  if (rErr || !report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  // Fetch active recipients
  const { data: recipients } = await supabase
    .from('report_recipients')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true);
  if (!recipients || recipients.length === 0)
    return NextResponse.json({ error: 'No active recipients' }, { status: 400 });

  const reportData: ReportData = report.report_data;
  const html = buildEmailHtml(reportData);
  const monthLabel = formatMonthFull(reportData.month);
  const subject = `Pearson Financial Report — ${monthLabel}${report.is_partial ? ' (Mid-Month)' : ''}`;

  // Send via Resend
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  const sendResults = await Promise.allSettled(
    recipients.map((r) =>
      resend.emails.send({
        from: 'Pearson Dashboard <reports@frameworksinc.ca>',
        to: r.email,
        subject,
        html,
      })
    )
  );

  const failed = sendResults.filter((r) => r.status === 'rejected').length;
  if (failed > 0 && failed === recipients.length) {
    return NextResponse.json({ error: 'All sends failed' }, { status: 500 });
  }

  // Mark as sent
  await supabase
    .from('monthly_reports')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', reportId);

  return NextResponse.json({ ok: true, sent: recipients.length - failed, failed });
}
