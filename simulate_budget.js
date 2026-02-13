
// Mock Data and Logic from ui-v67.js

// Mock format utility
function formatNumberWithDots(amount) {
    if (amount === undefined || amount === null) return '0';
    return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Mock Store Data
const income = 5000000;
const profile = 'BALANCEADO';

// Categories (Subset for brevity, matching the UI filter)
const categories = [
    { id: 'cat_1', name: 'Alquiler', group: 'VIVIENDA' }, // Arriendo
    { id: 'cat_viv_net', name: 'Internet', group: 'VIVIENDA' }, // Internet
    { id: 'cat_2', name: 'Alimentación', group: 'NECESIDADES' },
    { id: 'cat_3', name: 'Transporte', group: 'NECESIDADES' },
    { id: 'cat_9', name: 'Ocio', group: 'ESTILO_DE_VIDA' },
    { id: 'cat_5', name: 'Ahorro', group: 'FINANCIERO' }
];

// Fixed Expenses (Simulating User Setup)
const fixedExpenses = [
    { id: 'fe_1', name: 'Arriendo', amount: 1500000, category_id: 'cat_1' },
    { id: 'fe_2', name: 'Internet', amount: 100000, category_id: 'cat_viv_net' }
];

// Weights (from ui-v67.js)
const distributions = {
    'BALANCEADO': {
        'cat_1': 0.20, 'cat_2': 0.12, 'cat_3': 0.05, 'cat_gasolina': 0.04,
        'cat_4': 0.05, 'cat_9': 0.05, 'cat_personal': 0.04, 'cat_deporte': 0.03,
        'cat_vicios': 0.01, 'cat_8': 0.05, 'cat_10': 0.04, 'cat_5': 0.08,
        'cat_6': 0.05, 'cat_7': 0.05, 'cat_fin_4': 0.02, 'cat_fin_5': 0.02,
        'cat_rest': 0.04, 'cat_viv_luz': 0.01, 'cat_viv_agua': 0.01,
        'cat_viv_net': 0.02, 'cat_viv_cel': 0.01, 'cat_viv_man': 0.01
    }
};

const weights = distributions[profile];

// Logic Implementation (copied from ui-v67.js)

// 1. Calculate floors per category
const fixedFloor = {};
fixedExpenses.forEach(fe => {
    if (fe.category_id && fe.amount) {
        fixedFloor[fe.category_id] = (fixedFloor[fe.category_id] || 0) + fe.amount;
    }
});

// 2. Identify active categories (Simulating UI querySelector presence)
// Assuming all defined categories are active
const activeCats = categories;

// 3. Sum total fixed obligations for these categories
const totalFixed = activeCats.reduce((sum, cat) => sum + (fixedFloor[cat.id] || 0), 0);
const surplus = income - totalFixed;

console.log('--- Inputs ---');
console.log(`Income: ${formatNumberWithDots(income)}`);
console.log(`Total Fixed: ${formatNumberWithDots(totalFixed)}`);
console.log(`Surplus: ${formatNumberWithDots(surplus)}`);

if (surplus < 0) {
    console.log('SCENARIO A: DEFICIT');
} else {
    console.log('SCENARIO B: COHERENT');

    // 1. Calculate weighted target for the surplus
    const rawSuggestions = {};

    activeCats.forEach(cat => {
        const floor = fixedFloor[cat.id] || 0;
        const weight = weights[cat.id] || 0.005;
        const ideal = income * weight;
        const gap = Math.max(0, ideal - floor);
        rawSuggestions[cat.id] = { floor, gap };
    });

    // Calculate sum of gaps to distribute surplus
    const totalGap = activeCats.reduce((s, c) => s + rawSuggestions[c.id].gap, 0);
    console.log(`Total Gap (Ideal - Floor): ${formatNumberWithDots(totalGap)}`);

    const finalValues = {};
    let totalRounded = 0;

    activeCats.forEach((cat, index) => {
        const { floor, gap } = rawSuggestions[cat.id];
        let extra = 0;
        if (totalGap > 0) {
            extra = surplus * (gap / totalGap);
        } else {
            const sumWeights = activeCats.reduce((s, c) => s + (weights[c.id] || 0.005), 0);
            extra = surplus * ((weights[cat.id] || 0.005) / sumWeights);
        }

        let val = floor + extra;

        // Round everything to nearest 1000 except the last active category
        if (index < activeCats.length - 1) {
            val = Math.round(val / 1000) * 1000;
            totalRounded += val;
        }
        finalValues[cat.id] = val;
    });

    // Adjust last category (Residual match)
    const lastCat = activeCats[activeCats.length - 1];
    const remainingForLast = income - totalRounded;
    finalValues[lastCat.id] = Math.max(0, remainingForLast);

    console.log('--- Results ---');
    let totalActual = 0;
    activeCats.forEach(cat => {
        const val = finalValues[cat.id];
        totalActual += val;
        console.log(`${cat.name}: ${formatNumberWithDots(val)} (Floor: ${fixedFloor[cat.id] || 0})`);
    });

    console.log(`Total Actual: ${formatNumberWithDots(totalActual)}`);
    console.log(`Matches Income? ${totalActual === income}`);

    if (Math.abs(totalActual - income) > 1) {
        console.error('FAIL: Sum does not match income!');
    } else {
        console.log('SUCCESS: Sum matches income exactly.');
    }
}
