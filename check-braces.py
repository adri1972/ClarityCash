with open('js/ui_v68_final.js', 'r') as f:
    content = f.read()
    open_b = content.count('{')
    close_b = content.count('}')
    print(f"Open: {open_b}, Close: {close_b}, Diff: {open_b - close_b}")
