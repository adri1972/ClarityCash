
def check_braces(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    stack = []
    
    for i, line in enumerate(lines):
        for char in line:
            if char in '{[(':
                stack.append((char, i + 1))
            elif char in '}])':
                if not stack:
                    print(f"Error: Unmatched '{char}' at line {i + 1}")
                    return
                last, line_num = stack.pop()
                if (last == '{' and char != '}') or \
                   (last == '[' and char != ']') or \
                   (last == '(' and char != ')'):
                    print(f"Error: Mismatched '{last}' (line {line_num}) with '{char}' at line {i + 1}")
                    return

    if stack:
        last, line_num = stack.pop()
        print(f"Error: Unclosed '{last}' at line {line_num}")
    else:
        print("Success: All braces matched correctly!")

check_braces('js/ui-v67.js')
