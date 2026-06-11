// Pure, isomorphic financial calculations.
// Ported verbatim from the original Streamlit app's calculations.py / savings.py.

/** Round to 2 decimal places (matches Python round() for the values used here). */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Parse a 'YYYY-MM-DD' (or 'YYYY-MM') string into a comparable {y, m, d} tuple.
 * Returns null for falsy input.
 */
function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map((x) => parseInt(x, 10));
  return { y, m: m || 1, d: d || 1 };
}

/** Compare two {y,m,d} tuples: returns true if a >= b. */
function dateGte(a, b) {
  if (a.y !== b.y) return a.y > b.y;
  if (a.m !== b.m) return a.m > b.m;
  return a.d >= b.d;
}

/** Format a {y,m,d} tuple as 'YYYY-MM'. */
function fmtYearMonth({ y, m }) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * Monthly amortization schedule.
 *
 * Mirrors calculate_mortgage_payments(interest_rate, years_left, balance,
 * additional_repayment, lump_sum, start_date, new_rate, new_rate_date).
 *
 * @param {Object} opts
 * @param {number} opts.interestRate        annual rate, percent (e.g. 3.5)
 * @param {number} opts.yearsLeft           whole years remaining
 * @param {number} opts.balance             current outstanding balance
 * @param {number} [opts.additionalRepayment=0]
 * @param {number} [opts.lumpSum=0]
 * @param {string|null} [opts.startDate=null]   'YYYY-MM-DD'; defaults to today
 * @param {number|null} [opts.newRate=null]     annual rate, percent
 * @param {string|null} [opts.newRateDate=null] 'YYYY-MM-DD'
 * @returns {{schedule: Array, totalPrincipalPaid: number, totalInterestPaid: number, finalMonthlyPayment: number}}
 */
export function calculateMortgagePayments({
  interestRate,
  yearsLeft,
  balance,
  additionalRepayment = 0,
  lumpSum = 0,
  startDate = null,
  newRate = null,
  newRateDate = null,
}) {
  let monthlyRate = interestRate / 100 / 12;
  const numPayments = yearsLeft * 12;

  if (lumpSum > 0) {
    balance -= lumpSum; // Apply lump sum payment
  }

  if (balance <= 0) {
    throw new Error('Lump sum payment exceeds mortgage balance.');
  }

  let monthlyPayment;
  if (monthlyRate !== 0) {
    monthlyPayment =
      (balance * (monthlyRate * (1 + monthlyRate) ** numPayments)) /
      ((1 + monthlyRate) ** numPayments - 1);
  } else {
    monthlyPayment = balance / numPayments;
  }
  let totalMonthlyPayment = monthlyPayment + additionalRepayment;

  const schedule = [];
  let remainingBalance = balance;

  // Current "month cursor". Day is preserved across increments (as in Python's
  // datetime.replace(month=...)), and only matters for the new-rate comparison.
  let current;
  if (startDate) {
    current = parseDate(startDate);
  } else {
    const now = new Date();
    current = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }

  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;

  const newRateTuple = newRateDate ? parseDate(newRateDate) : null;

  while (remainingBalance > 0 && schedule.length < numPayments) {
    // Apply the new rate once the cursor reaches its effective date.
    if (newRate && newRateTuple && dateGte(current, newRateTuple)) {
      monthlyRate = newRate / 100 / 12;
      const remainingMonths = numPayments - schedule.length;
      if (remainingMonths > 0) {
        if (monthlyRate !== 0) {
          monthlyPayment =
            (remainingBalance * (monthlyRate * (1 + monthlyRate) ** remainingMonths)) /
            ((1 + monthlyRate) ** remainingMonths - 1);
        } else {
          monthlyPayment = remainingBalance / remainingMonths;
        }
        totalMonthlyPayment = monthlyPayment + additionalRepayment;
      }
    }

    const interestPayment = remainingBalance * monthlyRate;
    let principalPayment = totalMonthlyPayment - interestPayment;
    remainingBalance -= principalPayment;

    if (remainingBalance < 0) {
      principalPayment += remainingBalance; // Don't overpay past zero
      remainingBalance = 0;
    }

    totalPrincipalPaid += principalPayment;
    totalInterestPaid += interestPayment;

    schedule.push({
      Date: fmtYearMonth(current),
      'Principal Payment': round2(principalPayment),
      'Interest Payment': round2(interestPayment),
      'Total Payment': round2(totalMonthlyPayment),
      'Remaining Balance': round2(remainingBalance),
    });

    // Increment the month, rolling the year over.
    let nextMonth = current.m + 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      current = { ...current, y: current.y + 1 };
    }
    current = { ...current, m: nextMonth };
  }

  return {
    schedule,
    totalPrincipalPaid,
    totalInterestPaid,
    finalMonthlyPayment: totalMonthlyPayment,
  };
}

/**
 * Yearly compound-interest projection for savings.
 *
 * Mirrors calculate_compound_interest(principal, annual_rate, inflation_rate,
 * years) with the inflation toggle from session_state.inflation_status.
 *
 * @param {Object} opts
 * @param {number} opts.principal
 * @param {number} opts.annualRate        percent
 * @param {number} opts.inflationRate     percent
 * @param {number} opts.years
 * @param {boolean} [opts.includeInflation=false]
 * @returns {{rows: Array, totalInterest: number, finalBalance: number}}
 */
export function calculateCompoundInterest({
  principal,
  annualRate,
  inflationRate,
  years,
  includeInflation = false,
}) {
  const rows = [];
  let totalBalance = principal;
  let totalInterest = 0;

  for (let year = 1; year <= years; year++) {
    const interestAccrued = totalBalance * (annualRate / 100);
    const inflationAdjustment = includeInflation ? totalBalance * (inflationRate / 100) : 0;

    totalBalance += interestAccrued - inflationAdjustment;
    totalInterest += interestAccrued;

    rows.push({
      Year: year,
      'Interest Accrued': round2(interestAccrued),
      'Inflation Adjustment': round2(inflationAdjustment),
      'Running Balance': round2(totalBalance),
    });
  }

  return {
    rows,
    totalInterest,
    finalBalance: totalBalance,
  };
}
