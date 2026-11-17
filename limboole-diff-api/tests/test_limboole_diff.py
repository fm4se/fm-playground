from limboole_diff.limboole_diff import (
    common_witness,
    diff_witness,
    get_next_witness,
    sanitize_formula,
    semantic_relation,
    store_witness,
)


def test_semantic_relation_equivalent():
    f1 = "a & b"
    f2 = "a & b"
    relation = semantic_relation(f1, f2)
    assert "Current ≡ Previous" in relation


def test_semantic_relation_previous_implies_current():
    f1 = "a & b"  # current
    f2 = "a"  # previous
    relation = semantic_relation(f1, f2)
    assert "Current ⊨ Previous" in relation


def test_semantic_relation_incomparable():
    f1 = "a & b"
    f2 = "b & c"
    relation = semantic_relation(f1, f2)
    assert "The formulas are incomparable" in relation


def test_common_witness():
    f1 = "a & b & d"
    f2 = "a & b & c"
    specId, witness = common_witness(f1, f2)
    assert specId is not None
    assert "a = 1" in witness
    assert "b = 1" in witness


def test_diff_witness():
    f1 = "a & b & d"
    f2 = "a & b & c"
    specId, witness = diff_witness(f1, f2)
    assert specId is not None
    assert "d = 1" in witness
    assert "c = 0" in witness


def test_sanitize_formula():
    formula = """
    a & b % this is a comment
    & c   % another comment
    & d
    """
    sanitized = sanitize_formula(formula)
    expected = "a & b & c & d"
    assert sanitized == expected

    formula = "a & b    &    c"
    sanitized = sanitize_formula(formula)
    expected = "a & b & c"
    assert sanitized == expected

    formula = """
    a %& b  this is a comment
    % another comment
    & c   % another comment
    & d
    """
    sanitized = sanitize_formula(formula)
    expected = "a & c & d"
    assert sanitized == expected


def test_common_filtered():
    f1 = "a & b & d"
    f2 = "a & b & c"
    filter = "!a"
    specId, witness = common_witness(f1, f2, filter)
    assert "UNSATISFIABLE" in witness
    specId, witness = common_witness(f1, f2)
    assert "a = 1" in witness


def test_get_variables_from_formula():
    from limboole_diff.limboole_diff import get_variables_from_formula

    formula = "a & b | c -> d <-> !e"
    variables = get_variables_from_formula(formula)
    expected_vars = ["a", "b", "c", "d", "e"]
    assert variables == expected_vars


def test_prettify_result():
    from limboole_diff.limboole_diff import prettify_result

    f1 = "a & b & d"
    f2 = "a & b & c"
    result = """% SATISFIABLE
    a = 1
    b = 1
    c = 0
    d = 1
    """
    pretty = prettify_result(f1, f2, result)
    assert "a = 1" in pretty
    assert "b = 1" in pretty
    assert "c = 0" not in pretty
    assert "d = 1" not in pretty


def test_get_next_witness():
    f1 = "a | b | d"
    f2 = "a | b | c"
    specId, witness = store_witness(f1, f2, mode="common")
    next_witness = get_next_witness(specId)
    assert next_witness is not None


def test_enumeration_blocks_variables_of_one_formula():
    # previous & !current == x, with y free: two witnesses that differ only in y,
    # which occurs only in the current formula (and is wrapped in a <span>).
    previous = "x"
    current = "!x & y"
    specId, first = store_witness(previous, current, analysis="not-current-but-previous")
    assert specId is not None and "<span" in first
    second = get_next_witness(specId)
    assert second is not None
    assert get_next_witness(specId) is None
