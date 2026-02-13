
import math

def format_number_with_dots(amount):
    if amount is None:
        return '0'
    s = str(int(round(amount)))
    # reverse, chunk by 3, reverse back
    return '.'.join([s[::-1][i:i+3] for i in range(0, len(s), 3)])[::-1]

# Mock Data
income = 5000000
profile = 'BALANCEADO'

categories = [
    { 'id': 'cat_1', 'name': 'Alquiler', 'group': 'VIVIENDA' }, 
    { 'id': 'cat_viv_net', 'name': 'Internet', 'group': 'VIVIENDA' },
    { 'id': 'cat_2', 'name': 'Alimentacion', 'group': 'NECESIDADES' },
    { 'id': 'cat_3', 'name': 'Transporte', 'group': 'NECESIDADES' },
    { 'id': 'cat_9', 'name': 'Ocio', 'group': 'ESTILO_DE_VIDA' },
    { 'id': 'cat_5', 'name': 'Ahorro', 'group': 'FINANCIERO' }
]

fixed_expenses = [
    { 'id': 'fe_1', 'name': 'Arriendo', 'amount': 1500000, 'category_id': 'cat_1' },
    { 'id': 'fe_2', 'name': 'Internet', 'amount': 100000, 'category_id': 'cat_viv_net' }
]

distributions = {
    'BALANCEADO': {
        'cat_1': 0.20, 'cat_2': 0.12, 'cat_3': 0.05, 'cat_gasolina': 0.04,
        'cat_4': 0.05, 'cat_9': 0.05, 'cat_personal': 0.04, 'cat_deporte': 0.03,
        'cat_vicios': 0.01, 'cat_8': 0.05, 'cat_10': 0.04, 'cat_5': 0.08,
        'cat_6': 0.05, 'cat_7': 0.05, 'cat_fin_4': 0.02, 'cat_fin_5': 0.02,
        'cat_rest': 0.04, 'cat_viv_luz': 0.01, 'cat_viv_agua': 0.01,
        'cat_viv_net': 0.02, 'cat_viv_cel': 0.01, 'cat_viv_man': 0.01
    }
}
weights = distributions[profile]

# Logic
fixed_floor = {}
for fe in fixed_expenses:
    cat_id = fe['category_id']
    amt = fe['amount']
    fixed_floor[cat_id] = fixed_floor.get(cat_id, 0) + amt

active_cats = categories # simulating active inputs
total_fixed = sum(fixed_floor.get(cat['id'], 0) for cat in active_cats)
surplus = income - total_fixed

print(f"Income: {format_number_with_dots(income)}")
print(f"Total Fixed: {format_number_with_dots(total_fixed)}")
print(f"Surplus: {format_number_with_dots(surplus)}")

if surplus < 0:
    print("SCENARIO A: DEFICIT")
else:
    print("SCENARIO B: COHERENT")
    raw_suggestions = {}
    for cat in active_cats:
        floor = fixed_floor.get(cat['id'], 0)
        weight = weights.get(cat['id'], 0.005)
        ideal = income * weight
        gap = max(0, ideal - floor)
        raw_suggestions[cat['id']] = { 'floor': floor, 'gap': gap }
    
    total_gap = sum(data['gap'] for data in raw_suggestions.values())
    print(f"Total Gap: {format_number_with_dots(total_gap)}")

    final_values = {}
    total_rounded = 0
    
    for index, cat in enumerate(active_cats):
        data = raw_suggestions[cat['id']]
        floor = data['floor']
        gap = data['gap']
        
        extra = 0
        if total_gap > 0:
            extra = surplus * (gap / total_gap)
        else:
            sum_weights = sum(weights.get(c['id'], 0.005) for c in active_cats)
            w = weights.get(cat['id'], 0.005)
            extra = surplus * (w / sum_weights)
        
        val = floor + extra
        
        # Round logic
        # Round everything to nearest 1000 except the last active category
        if index < len(active_cats) - 1:
            val = round(val / 1000) * 1000
            total_rounded += val
            final_values[cat['id']] = val
            print(f"Cat {cat['name']}: {val} (Rounded)")
        else:
             # Last cat logic
             pass

    # Adjust last category
    last_cat = active_cats[-1]
    remaining_for_last = income - total_rounded
    final_values[last_cat['id']] = max(0, remaining_for_last)
    print(f"Cat {last_cat['name']} (Last): {final_values[last_cat['id']]} (Residual)")

    total_actual = sum(final_values.values())
    print(f"Total Actual: {format_number_with_dots(total_actual)}")
    
    match = abs(total_actual - income) < 1
    print(f"Matches Income? {match}")
