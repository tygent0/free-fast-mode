def add(a: int, b: int) -> int:
    return a + b


def div(a: int, b: int) -> float:
    if b == 0:
        raise ValueError("divide by zero")
    return a / b
