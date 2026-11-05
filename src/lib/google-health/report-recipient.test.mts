import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FITBIT_REPORT_EMAIL_UNREADABLE,
  FITBIT_REPORT_OTHER_ACCOUNT,
  fitbitEmailErrorPatch,
  fitbitEmailRequested,
  fitbitReportDecision,
  isFitbitReportAccount,
} from './config.ts';

const primary = 'primary@example.com';
const household = 'household@example.com';
const recipients = [primary];

test('the daily report matches only an auth email listed in FITBIT_REPORT_EMAIL', () => {
  assert.equal(isFitbitReportAccount(primary, recipients), true);
  assert.equal(isFitbitReportAccount('Primary@Example.com', recipients), true);
  assert.equal(isFitbitReportAccount(`  ${primary}  `, recipients), true);
  assert.equal(isFitbitReportAccount(household, recipients), false);
  assert.equal(isFitbitReportAccount(household, [primary, 'other@example.com']), false);
  assert.equal(isFitbitReportAccount(household, [primary, household]), true);
  assert.equal(isFitbitReportAccount(primary, [`Reports <${primary}>`]), true);
  assert.equal(isFitbitReportAccount(null, recipients), false);
  assert.equal(isFitbitReportAccount('   ', recipients), false);
  assert.equal(isFitbitReportAccount(primary, []), false);
});

test('a household account is synced with email on but does not send', () => {
  assert.deepEqual(fitbitReportDecision(true, primary, recipients), { send: true });
  assert.deepEqual(fitbitReportDecision(true, household, recipients), {
    send: false,
    reason: FITBIT_REPORT_OTHER_ACCOUNT,
  });
  assert.deepEqual(fitbitReportDecision(true, null, recipients), {
    send: false,
    reason: FITBIT_REPORT_OTHER_ACCOUNT,
  });
});

test('email=0 stays silent even for the report account', () => {
  assert.deepEqual(fitbitReportDecision(false, primary, recipients), {
    send: false,
    reason: 'skipped',
  });
  assert.equal(fitbitEmailRequested(null), true);
  assert.equal(fitbitEmailRequested(''), true);
  assert.equal(fitbitEmailRequested('  '), true);
  assert.equal(fitbitEmailRequested('1'), true);
  for (const flag of ['0', 'false', 'no', 'off', 'FALSE', ' 0 ']) {
    assert.equal(fitbitEmailRequested(flag), false, flag);
  }
});

test('skipping another account does not record an email error', () => {
  assert.deepEqual(fitbitEmailErrorPatch(null), {});
  assert.deepEqual(fitbitEmailErrorPatch({ sent: false, reason: FITBIT_REPORT_OTHER_ACCOUNT }), {});
  assert.deepEqual(fitbitEmailErrorPatch({ sent: false, reason: FITBIT_REPORT_EMAIL_UNREADABLE }), {});
  assert.deepEqual(fitbitEmailErrorPatch({ sent: false, reason: 'skipped' }), {});
  assert.deepEqual(fitbitEmailErrorPatch({ sent: false, reason: 'FITBIT_REPORT_EMAIL is not set' }), {
    last_email_error: 'FITBIT_REPORT_EMAIL is not set',
  });
  assert.deepEqual(fitbitEmailErrorPatch({ sent: true }), { last_email_error: null });
});

test('an unset FITBIT_REPORT_EMAIL matches nobody', () => {
  const previous = process.env.FITBIT_REPORT_EMAIL;
  delete process.env.FITBIT_REPORT_EMAIL;
  try {
    assert.equal(isFitbitReportAccount(primary), false);
    assert.deepEqual(fitbitReportDecision(true, primary), {
      send: false,
      reason: FITBIT_REPORT_OTHER_ACCOUNT,
    });
  } finally {
    if (previous === undefined) delete process.env.FITBIT_REPORT_EMAIL;
    else process.env.FITBIT_REPORT_EMAIL = previous;
  }
});
