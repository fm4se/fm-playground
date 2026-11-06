/**
 * Builtin catalog: floating-point, strings, Z3 sequences, characters, finite fields
 * and finite sets.
 *
 * Derived from the SMT-LIB FloatingPoint and Strings theories and from Z3's
 * `fpa_decl_plugin.cpp`, `seq_decl_plugin.cpp`, `char_decl_plugin.cpp`,
 * `ff_decl_plugin.cpp` and `finite_set_decl_plugin.cpp` (get_op_names / get_sort_names).
 *
 * Note: in Z3, `String` is `(Seq Unicode)` and `RegLan` is `(RegEx String)`. Because the
 * checker may treat `String`/`RegLan` as distinct sorts, polymorphic sequence / regex
 * operations list explicit String / RegLan ranks first, followed by the generic ranks.
 */
import type { BuiltinFunctionSpec, BuiltinSortSpec } from './types.js';

export const extSorts: BuiltinSortSpec[] = [
    // ---------------------------------------------------------------- FloatingPoint
    {
        name: 'FloatingPoint', theory: 'FloatingPoint', arity: 0, indices: ['eb', 'sb'],
        doc: 'IEEE 754 binary floating-point numbers with `eb` exponent bits and `sb` significand bits (including the hidden bit), e.g. `(_ FloatingPoint 8 24)`.'
    },
    {
        name: 'Float16', theory: 'FloatingPoint', arity: 0, alias: '(_ FloatingPoint 5 11)',
        doc: 'IEEE 754 half precision, abbreviation for `(_ FloatingPoint 5 11)`.'
    },
    {
        name: 'Float32', theory: 'FloatingPoint', arity: 0, alias: '(_ FloatingPoint 8 24)',
        doc: 'IEEE 754 single precision, abbreviation for `(_ FloatingPoint 8 24)`.'
    },
    {
        name: 'Float64', theory: 'FloatingPoint', arity: 0, alias: '(_ FloatingPoint 11 53)',
        doc: 'IEEE 754 double precision, abbreviation for `(_ FloatingPoint 11 53)`.'
    },
    {
        name: 'Float128', theory: 'FloatingPoint', arity: 0, alias: '(_ FloatingPoint 15 113)',
        doc: 'IEEE 754 quadruple precision, abbreviation for `(_ FloatingPoint 15 113)`.'
    },
    {
        name: 'RoundingMode', theory: 'FloatingPoint', arity: 0,
        doc: 'The five IEEE 754 rounding modes: RNE, RNA, RTP, RTN and RTZ.'
    },
    // ---------------------------------------------------------------- Strings
    {
        name: 'String', theory: 'Strings', arity: 0,
        doc: 'Strings of Unicode characters. In Z3, `String` is the same sort as `(Seq Unicode)`.'
    },
    {
        name: 'RegLan', theory: 'Strings', arity: 0,
        doc: 'Regular languages over strings. In Z3, `RegLan` is the same sort as `(RegEx String)`.'
    },
    {
        name: 'StringSequence', theory: 'Z3 Strings', arity: 0, alias: 'String', z3Only: true,
        doc: 'Legacy (SMT-LIB 2.5 era) Z3 name for the `String` sort.'
    },
    // ---------------------------------------------------------------- Z3 sequences
    {
        name: 'Seq', theory: 'Z3 Sequences', arity: 1, z3Only: true,
        doc: 'Finite sequences over an element sort, e.g. `(Seq Int)`. `(Seq Unicode)` is the same sort as `String`.'
    },
    {
        name: 'RegEx', theory: 'Z3 Sequences', arity: 1, z3Only: true,
        doc: 'Regular expressions over a sequence sort, e.g. `(RegEx (Seq Int))`. `(RegEx String)` is the same sort as `RegLan`.'
    },
    // ---------------------------------------------------------------- Z3 characters
    {
        name: 'Unicode', theory: 'Z3 Characters', arity: 0, z3Only: true,
        doc: 'Unicode characters (code points 0 to 196607 by default; see the `encoding` parameter). Elements of `String`.'
    },
    // ---------------------------------------------------------------- Z3 finite fields
    {
        name: 'FiniteField', theory: 'Z3 Finite Fields', arity: 0, indices: ['p'], z3Only: true,
        doc: 'Prime field with `p` elements, e.g. `(_ FiniteField 7)`. The modulus must be prime and may be arbitrarily large.'
    },
    // ---------------------------------------------------------------- Z3 finite sets
    {
        name: 'FiniteSet', theory: 'Z3 Finite Sets', arity: 1, z3Only: true,
        doc: 'Finite sets over an element sort, e.g. `(FiniteSet Int)`.'
    },
];

export const extFunctions: BuiltinFunctionSpec[] = [
    // =====================================================================
    // FloatingPoint (SMT-LIB standard)
    // =====================================================================
    // Rounding modes
    { name: 'roundNearestTiesToEven', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round to nearest, ties to even. Same as `RNE`.' },
    { name: 'roundNearestTiesToAway', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round to nearest, ties away from zero. Same as `RNA`.' },
    { name: 'roundTowardPositive', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward positive infinity. Same as `RTP`.' },
    { name: 'roundTowardNegative', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward negative infinity. Same as `RTN`.' },
    { name: 'roundTowardZero', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward zero. Same as `RTZ`.' },
    { name: 'RNE', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round to nearest, ties to even (`roundNearestTiesToEven`).' },
    { name: 'RNA', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round to nearest, ties away from zero (`roundNearestTiesToAway`).' },
    { name: 'RTP', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward positive infinity (`roundTowardPositive`).' },
    { name: 'RTN', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward negative infinity (`roundTowardNegative`).' },
    { name: 'RTZ', theory: 'FloatingPoint', ranks: ['-> RoundingMode'], doc: 'Round toward zero (`roundTowardZero`).' },

    // Literals and special values
    {
        name: 'fp', theory: 'FloatingPoint',
        ranks: ['(_ BitVec 1) (_ BitVec eb) (_ BitVec i) -> (_ FloatingPoint eb {i+1})'],
        doc: 'Builds a floating-point value from sign bit, biased exponent and trailing significand: `(fp #b0 #b10000000 #b000...)`. The result sort is `(_ FloatingPoint eb sb)` where sb is the significand width plus one.'
    },
    { name: '+zero', theory: 'FloatingPoint', indices: ['eb', 'sb'], ranks: ['-> (_ FloatingPoint eb sb)'], doc: 'Positive zero of sort `(_ FloatingPoint eb sb)`.' },
    { name: '-zero', theory: 'FloatingPoint', indices: ['eb', 'sb'], ranks: ['-> (_ FloatingPoint eb sb)'], doc: 'Negative zero of sort `(_ FloatingPoint eb sb)`.' },
    { name: '+oo', theory: 'FloatingPoint', indices: ['eb', 'sb'], ranks: ['-> (_ FloatingPoint eb sb)'], doc: 'Positive infinity of sort `(_ FloatingPoint eb sb)`.' },
    { name: '-oo', theory: 'FloatingPoint', indices: ['eb', 'sb'], ranks: ['-> (_ FloatingPoint eb sb)'], doc: 'Negative infinity of sort `(_ FloatingPoint eb sb)`.' },
    { name: 'NaN', theory: 'FloatingPoint', indices: ['eb', 'sb'], ranks: ['-> (_ FloatingPoint eb sb)'], doc: 'Not-a-number of sort `(_ FloatingPoint eb sb)`.' },
    // Z3 also accepts the special values as plain symbols qualified with `as`.
    { name: '+zero', theory: 'Z3 Floating-Point', ranks: ['-> (_ FloatingPoint eb sb)'], z3Only: true, doc: 'Positive zero; Z3 accepts the non-indexed form with a sort ascription, e.g. `(as +zero Float32)`.' },
    { name: '-zero', theory: 'Z3 Floating-Point', ranks: ['-> (_ FloatingPoint eb sb)'], z3Only: true, doc: 'Negative zero; Z3 accepts the non-indexed form with a sort ascription, e.g. `(as -zero Float32)`.' },
    { name: '+oo', theory: 'Z3 Floating-Point', ranks: ['-> (_ FloatingPoint eb sb)'], z3Only: true, doc: 'Positive infinity; Z3 accepts the non-indexed form with a sort ascription, e.g. `(as +oo Float32)`.' },
    { name: '-oo', theory: 'Z3 Floating-Point', ranks: ['-> (_ FloatingPoint eb sb)'], z3Only: true, doc: 'Negative infinity; Z3 accepts the non-indexed form with a sort ascription, e.g. `(as -oo Float32)`.' },
    { name: 'NaN', theory: 'Z3 Floating-Point', ranks: ['-> (_ FloatingPoint eb sb)'], z3Only: true, doc: 'Not-a-number; Z3 accepts the non-indexed form with a sort ascription, e.g. `(as NaN Float32)`.' },

    // Operations
    { name: 'fp.abs', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'], doc: 'Absolute value.' },
    { name: 'fp.neg', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'], doc: 'Negation (flips the sign bit, also for NaN).' },
    {
        name: 'fp.add', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Addition `(fp.add rm x y)` rounded with rounding mode `rm`.'
    },
    {
        name: 'fp.sub', theory: 'FloatingPoint',
        ranks: [
            'RoundingMode (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)',
            '(_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)',
        ],
        doc: 'Subtraction `(fp.sub rm x y)` rounded with rounding mode `rm`. Z3 also accepts the unary form `(fp.sub x)` as negation.'
    },
    {
        name: 'fp.mul', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Multiplication `(fp.mul rm x y)` rounded with rounding mode `rm`.'
    },
    {
        name: 'fp.div', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Division `(fp.div rm x y)` rounded with rounding mode `rm`.'
    },
    {
        name: 'fp.fma', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Fused multiply-add `(fp.fma rm x y z)` = x*y+z with a single rounding.'
    },
    {
        name: 'fp.sqrt', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Square root `(fp.sqrt rm x)` rounded with rounding mode `rm`.'
    },
    {
        name: 'fp.rem', theory: 'FloatingPoint',
        ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'IEEE remainder x - y*n, where n is x/y rounded to the nearest integer (ties to even).'
    },
    {
        name: 'fp.roundToIntegral', theory: 'FloatingPoint',
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Rounds `x` to an integral floating-point value using rounding mode `rm`.'
    },
    {
        name: 'fp.min', theory: 'FloatingPoint',
        ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Minimum of two values; the result for `(fp.min +0 -0)` is unspecified (either zero).'
    },
    {
        name: 'fp.max', theory: 'FloatingPoint',
        ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Maximum of two values; the result for `(fp.max +0 -0)` is unspecified (either zero).'
    },

    // Comparisons
    { name: 'fp.leq', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb)+ -> Bool'], doc: 'IEEE less-than-or-equal (chainable); false if any argument is NaN.' },
    { name: 'fp.lt', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb)+ -> Bool'], doc: 'IEEE less-than (chainable); false if any argument is NaN.' },
    { name: 'fp.geq', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb)+ -> Bool'], doc: 'IEEE greater-than-or-equal (chainable); false if any argument is NaN.' },
    { name: 'fp.gt', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb)+ -> Bool'], doc: 'IEEE greater-than (chainable); false if any argument is NaN.' },
    { name: 'fp.eq', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb)+ -> Bool'], doc: 'IEEE equality (chainable): `+0` equals `-0` and NaN equals nothing. Use `=` for structural equality.' },

    // Classification
    { name: 'fp.isNormal', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is a normal number.' },
    { name: 'fp.isSubnormal', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is a subnormal number.' },
    { name: 'fp.isZero', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is `+zero` or `-zero`.' },
    { name: 'fp.isInfinite', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is `+oo` or `-oo`.' },
    { name: 'fp.isNaN', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is NaN.' },
    { name: 'fp.isNegative', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is negative (sign bit set) and not NaN.' },
    { name: 'fp.isPositive', theory: 'FloatingPoint', ranks: ['(_ FloatingPoint eb sb) -> Bool'], doc: 'True iff the argument is positive (sign bit clear) and not NaN.' },

    // Conversions
    {
        name: 'to_fp', theory: 'FloatingPoint', indices: ['eb', 'sb'],
        ranks: [
            '(_ BitVec {eb+sb}) -> (_ FloatingPoint eb sb)',
            'RoundingMode (_ FloatingPoint m n) -> (_ FloatingPoint eb sb)',
            'RoundingMode Int -> (_ FloatingPoint eb sb)',
            'RoundingMode Real -> (_ FloatingPoint eb sb)',
            'RoundingMode (_ BitVec m) -> (_ FloatingPoint eb sb)',
            'RoundingMode Real Int -> (_ FloatingPoint eb sb)',
            'RoundingMode Int Real -> (_ FloatingPoint eb sb)',
            '(_ BitVec 1) (_ BitVec eb) (_ BitVec {sb-1}) -> (_ FloatingPoint eb sb)',
        ],
        doc: 'Converts to `(_ FloatingPoint eb sb)`: from an IEEE bit pattern, or with a rounding mode from another float, a Real/Int, or a signed bit-vector. Z3 extensions: `(rm sig exp)` as Real/Int pairs meaning sig*2^exp, and (sign, exponent, significand) bit-vectors.'
    },
    {
        name: 'to_fp_unsigned', theory: 'FloatingPoint', indices: ['eb', 'sb'],
        ranks: ['RoundingMode (_ BitVec m) -> (_ FloatingPoint eb sb)'],
        doc: 'Converts an unsigned bit-vector to `(_ FloatingPoint eb sb)` using the given rounding mode.'
    },
    {
        name: 'fp.to_ubv', theory: 'FloatingPoint', indices: ['m'],
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ BitVec m)'],
        doc: 'Converts to an unsigned m-bit bit-vector, rounding with `rm`. Unspecified for NaN, infinities and out-of-range values.'
    },
    {
        name: 'fp.to_sbv', theory: 'FloatingPoint', indices: ['m'],
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ BitVec m)'],
        doc: 'Converts to a signed (two\'s complement) m-bit bit-vector, rounding with `rm`. Unspecified for NaN, infinities and out-of-range values.'
    },
    {
        name: 'fp.to_real', theory: 'FloatingPoint',
        ranks: ['(_ FloatingPoint eb sb) -> Real'],
        doc: 'Converts a finite floating-point value to a Real. Unspecified for NaN and infinities.'
    },

    // =====================================================================
    // Z3 Floating-Point extensions
    // =====================================================================
    {
        name: 'fp.to_ieee_bv', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) -> (_ BitVec {eb+sb})'],
        doc: 'Returns the IEEE 754 bit pattern of a floating-point value (inverse of the 1-argument `(_ to_fp eb sb)`). NaN maps to some fixed NaN pattern.'
    },
    {
        name: 'to_ieee_bv', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) -> (_ BitVec {eb+sb})'],
        doc: 'Alias of `fp.to_ieee_bv`: the IEEE 754 bit pattern of a floating-point value.'
    },
    {
        name: 'fp.to_ieee_bv_I', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) -> (_ BitVec {eb+sb})'],
        doc: 'Internal interpreted variant of `fp.to_ieee_bv`.'
    },
    {
        name: 'fp.min_i', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Internal interpreted variant of `fp.min` (with a fixed choice for the unspecified `+0`/`-0` case).'
    },
    {
        name: 'fp.max_i', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) (_ FloatingPoint eb sb) -> (_ FloatingPoint eb sb)'],
        doc: 'Internal interpreted variant of `fp.max` (with a fixed choice for the unspecified `+0`/`-0` case).'
    },
    {
        name: 'fp.to_ubv_I', theory: 'Z3 Floating-Point', z3Only: true, indices: ['m'],
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ BitVec m)'],
        doc: 'Internal interpreted variant of `(_ fp.to_ubv m)`.'
    },
    {
        name: 'fp.to_sbv_I', theory: 'Z3 Floating-Point', z3Only: true, indices: ['m'],
        ranks: ['RoundingMode (_ FloatingPoint eb sb) -> (_ BitVec m)'],
        doc: 'Internal interpreted variant of `(_ fp.to_sbv m)`.'
    },
    {
        name: 'fp.to_real_I', theory: 'Z3 Floating-Point', z3Only: true,
        ranks: ['(_ FloatingPoint eb sb) -> Real'],
        doc: 'Internal interpreted variant of `fp.to_real`.'
    },

    // =====================================================================
    // Strings (SMT-LIB standard)
    // =====================================================================
    {
        name: 'char', theory: 'Strings', indices: ['n'],
        ranks: ['-> String'],
        doc: 'String of length 1 containing the character with code point `n`, e.g. `(_ char #x41)` is "A".'
    },
    { name: 'str.++', theory: 'Strings', ranks: ['String+ -> String'], doc: 'String concatenation (left-associative).' },
    { name: 'str.len', theory: 'Strings', ranks: ['String -> Int'], doc: 'Length of a string.' },
    { name: 'str.<', theory: 'Strings', ranks: ['String String+ -> Bool'], doc: 'Lexicographic strict order on strings (chainable in SMT-LIB; Z3 accepts only two arguments).' },
    { name: 'str.<=', theory: 'Strings', ranks: ['String String+ -> Bool'], doc: 'Lexicographic order on strings (chainable in SMT-LIB; Z3 accepts only two arguments).' },
    { name: 'str.at', theory: 'Strings', ranks: ['String Int -> String'], doc: '`(str.at s i)` is the string of length 1 at position `i` of `s`, or "" if `i` is out of range.' },
    { name: 'str.substr', theory: 'Strings', ranks: ['String Int Int -> String'], doc: '`(str.substr s i n)` is the longest substring of `s` starting at `i` of length at most `n`; "" if out of range.' },
    { name: 'str.prefixof', theory: 'Strings', ranks: ['String String -> Bool'], doc: '`(str.prefixof s t)` is true iff `s` is a prefix of `t`.' },
    { name: 'str.suffixof', theory: 'Strings', ranks: ['String String -> Bool'], doc: '`(str.suffixof s t)` is true iff `s` is a suffix of `t`.' },
    { name: 'str.contains', theory: 'Strings', ranks: ['String String -> Bool'], doc: '`(str.contains s t)` is true iff `t` is a substring of `s`.' },
    {
        name: 'str.indexof', theory: 'Strings', ranks: ['String String Int -> Int', 'String String -> Int'],
        doc: '`(str.indexof s t i)` is the first position >= `i` where `t` occurs in `s`, or -1. Z3 also accepts the 2-argument form (start 0).'
    },
    { name: 'str.replace', theory: 'Strings', ranks: ['String String String -> String'], doc: '`(str.replace s t u)` replaces the first occurrence of `t` in `s` by `u`.' },
    {
        name: 'str.replace_all', theory: 'Strings',
        ranks: ['String String String -> String', '(Seq A) (Seq A) (Seq A) -> (Seq A)'],
        doc: '`(str.replace_all s t u)` replaces all non-overlapping occurrences of `t` in `s` by `u`. Z3 also accepts sequences.'
    },
    {
        name: 'str.replace_re', theory: 'Strings',
        ranks: ['String RegLan String -> String', '(Seq A) (RegEx (Seq A)) (Seq A) -> (Seq A)'],
        doc: '`(str.replace_re s r u)` replaces the shortest leftmost non-empty match of `r` in `s` by `u`. Z3 also accepts sequences.'
    },
    {
        name: 'str.replace_re_all', theory: 'Strings',
        ranks: ['String RegLan String -> String', '(Seq A) (RegEx (Seq A)) (Seq A) -> (Seq A)'],
        doc: '`(str.replace_re_all s r u)` replaces, left to right, each shortest non-empty match of `r` in `s` by `u`. Z3 also accepts sequences.'
    },
    { name: 'str.is_digit', theory: 'Strings', ranks: ['String -> Bool'], doc: 'True iff the argument is a single character in the range "0" to "9".' },
    { name: 'str.to_code', theory: 'Strings', ranks: ['String -> Int'], doc: 'Code point of a single-character string, or -1 if the length is not 1.' },
    { name: 'str.from_code', theory: 'Strings', ranks: ['Int -> String'], doc: 'Single-character string with the given code point, or "" if out of range.' },
    { name: 'str.to_int', theory: 'Strings', ranks: ['String -> Int'], doc: 'Non-negative integer denoted by a string of decimal digits, or -1 if the string is not all digits.' },
    { name: 'str.from_int', theory: 'Strings', ranks: ['Int -> String'], doc: 'Decimal representation of a non-negative integer, or "" for negative integers.' },
    { name: 'str.to_re', theory: 'Strings', ranks: ['String -> RegLan'], doc: 'Regular language containing exactly the given string.' },
    { name: 'str.in_re', theory: 'Strings', ranks: ['String RegLan -> Bool'], doc: '`(str.in_re s r)` is true iff `s` is in the language of `r`.' },
    { name: 're.none', theory: 'Strings', ranks: ['-> RegLan'], doc: 'The empty regular language.' },
    { name: 're.all', theory: 'Strings', ranks: ['-> RegLan', '-> (RegEx (Seq A))'], doc: 'The language of all strings. In Z3 it can be ascribed a `(RegEx (Seq A))` sort with `as`.' },
    { name: 're.allchar', theory: 'Strings', ranks: ['-> RegLan', '-> (RegEx (Seq A))'], doc: 'The language of all strings of length 1. In Z3 it can be ascribed a `(RegEx (Seq A))` sort with `as`.' },
    {
        name: 're.++', theory: 'Strings', ranks: ['RegLan+ -> RegLan', '(RegEx (Seq A))+ -> (RegEx (Seq A))'],
        doc: 'Concatenation of regular languages (left-associative).'
    },
    {
        name: 're.union', theory: 'Strings', ranks: ['RegLan+ -> RegLan', '(RegEx (Seq A))+ -> (RegEx (Seq A))'],
        doc: 'Union of regular languages (left-associative).'
    },
    {
        name: 're.inter', theory: 'Strings', ranks: ['RegLan+ -> RegLan', '(RegEx (Seq A))+ -> (RegEx (Seq A))'],
        doc: 'Intersection of regular languages (left-associative).'
    },
    {
        name: 're.diff', theory: 'Strings', ranks: ['RegLan+ -> RegLan', '(RegEx (Seq A))+ -> (RegEx (Seq A))'],
        doc: 'Difference of regular languages (left-associative).'
    },
    { name: 're.*', theory: 'Strings', ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Kleene star (zero or more repetitions).' },
    { name: 're.+', theory: 'Strings', ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Kleene plus (one or more repetitions).' },
    { name: 're.opt', theory: 'Strings', ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Option: zero or one occurrence.' },
    { name: 're.comp', theory: 'Strings', ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Complement of a regular language.' },
    {
        name: 're.range', theory: 'Strings', ranks: ['String String -> RegLan', '(Seq A) (Seq A) -> (RegEx (Seq A))'],
        doc: '`(re.range a b)` is the set of single-character strings between `a` and `b` (inclusive); empty unless both are single characters.'
    },
    {
        name: 're.^', theory: 'Strings', indices: ['n'],
        ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'],
        doc: '`((_ re.^ n) r)` is `r` repeated exactly `n` times.'
    },
    {
        name: 're.loop', theory: 'Strings', indices: ['i', 'j'],
        ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'],
        doc: '`((_ re.loop i j) r)` is `r` repeated between `i` and `j` times. Z3 also accepts `(_ re.loop i)` (at least `i` times).'
    },

    // =====================================================================
    // Z3 string extensions and legacy aliases
    // =====================================================================
    {
        name: 're.loop', theory: 'Z3 Strings', z3Only: true,
        ranks: ['RegLan Int -> RegLan', 'RegLan Int Int -> RegLan'],
        doc: 'Legacy Z3 form `(re.loop r lo hi)` / `(re.loop r lo)`: `r` repeated between `lo` and `hi` times (or at least `lo` times). Bounds must be integer numerals.'
    },
    { name: 'str.in.re', theory: 'Z3 Strings', z3Only: true, ranks: ['String RegLan -> Bool'], doc: 'Legacy alias of `str.in_re`.' },
    { name: 'str.in-re', theory: 'Z3 Strings', z3Only: true, ranks: ['String RegLan -> Bool'], doc: 'Legacy alias of `str.in_re`.' },
    { name: 'str.to.re', theory: 'Z3 Strings', z3Only: true, ranks: ['String -> RegLan'], doc: 'Legacy alias of `str.to_re`.' },
    { name: 'str.to-re', theory: 'Z3 Strings', z3Only: true, ranks: ['String -> RegLan'], doc: 'Legacy alias of `str.to_re`.' },
    { name: 'str.to.int', theory: 'Z3 Strings', z3Only: true, ranks: ['String -> Int'], doc: 'Legacy alias of `str.to_int`.' },
    { name: 'str.to-int', theory: 'Z3 Strings', z3Only: true, ranks: ['String -> Int'], doc: 'Legacy alias of `str.to_int`.' },
    { name: 'int.to.str', theory: 'Z3 Strings', z3Only: true, ranks: ['Int -> String'], doc: 'Legacy alias of `str.from_int`.' },
    { name: 'str.from-int', theory: 'Z3 Strings', z3Only: true, ranks: ['Int -> String'], doc: 'Legacy alias of `str.from_int`.' },
    { name: 're.nostr', theory: 'Z3 Strings', z3Only: true, ranks: ['-> RegLan'], doc: 'Legacy alias of `re.none`, the empty regular language.' },
    { name: 're.complement', theory: 'Z3 Strings', z3Only: true, ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Alias of `re.comp`, the complement of a regular language.' },
    {
        name: 'str.from_ubv', theory: 'Z3 Strings', z3Only: true, ranks: ['(_ BitVec m) -> String'],
        doc: 'Decimal representation of a bit-vector read as an unsigned integer.'
    },
    {
        name: 'str.from_sbv', theory: 'Z3 Strings', z3Only: true, ranks: ['(_ BitVec m) -> String'],
        doc: 'Decimal representation of a bit-vector read as a signed (two\'s complement) integer.'
    },
    { name: 'str.power', theory: 'Z3 Strings', z3Only: true, ranks: ['String Int -> String'], doc: '`(str.power s n)` is `s` concatenated with itself `n` times.' },
    {
        name: 're.empty', theory: 'Z3 Strings', z3Only: true, ranks: ['-> RegLan', '-> (RegEx (Seq A))'],
        doc: 'The empty regular language; can be ascribed any `(RegEx (Seq A))` sort with `as`.'
    },
    {
        name: 're.xor', theory: 'Z3 Strings', z3Only: true, ranks: ['RegLan+ -> RegLan', '(RegEx (Seq A))+ -> (RegEx (Seq A))'],
        doc: 'Symmetric difference of regular languages.'
    },
    { name: 're.reverse', theory: 'Z3 Strings', z3Only: true, ranks: ['RegLan -> RegLan', '(RegEx (Seq A)) -> (RegEx (Seq A))'], doc: 'Reversal of a regular language.' },
    {
        name: 're.derivative', theory: 'Z3 Strings', z3Only: true,
        ranks: ['Unicode RegLan -> RegLan', 'A (RegEx (Seq A)) -> (RegEx (Seq A))'],
        doc: '`(re.derivative c r)` is the Brzozowski derivative of `r` with respect to the element `c`.'
    },
    {
        name: 're.of.pred', theory: 'Z3 Strings', z3Only: true,
        ranks: ['(Array Unicode Bool) -> RegLan', '(Array A Bool) -> (RegEx (Seq A))'],
        doc: 'Language of all length-1 sequences whose element satisfies the given predicate (array or lambda).'
    },

    // =====================================================================
    // Z3 Sequences
    // =====================================================================
    {
        name: 'seq.unit', theory: 'Z3 Sequences', z3Only: true, ranks: ['Unicode -> String', 'A -> (Seq A)'],
        doc: 'Sequence of length 1 containing the given element.'
    },
    {
        name: 'seq.empty', theory: 'Z3 Sequences', z3Only: true, ranks: ['-> (Seq A)', '-> String'],
        doc: 'The empty sequence; needs a sort ascription, e.g. `(as seq.empty (Seq Int))`.'
    },
    { name: 'seq.++', theory: 'Z3 Sequences', z3Only: true, ranks: ['String+ -> String', '(Seq A)+ -> (Seq A)'], doc: 'Sequence concatenation.' },
    { name: 'seq.len', theory: 'Z3 Sequences', z3Only: true, ranks: ['String -> Int', '(Seq A) -> Int'], doc: 'Length of a sequence.' },
    {
        name: 'seq.extract', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String Int Int -> String', '(Seq A) Int Int -> (Seq A)'],
        doc: '`(seq.extract s i n)` is the subsequence of `s` starting at `i` of length at most `n`.'
    },
    {
        name: 'seq.at', theory: 'Z3 Sequences', z3Only: true, ranks: ['String Int -> String', '(Seq A) Int -> (Seq A)'],
        doc: '`(seq.at s i)` is the unit sequence at position `i`, or the empty sequence if out of range.'
    },
    {
        name: 'seq.nth', theory: 'Z3 Sequences', z3Only: true, ranks: ['String Int -> Unicode', '(Seq A) Int -> A'],
        doc: '`(seq.nth s i)` is the element at position `i`; unspecified if `i` is out of range.'
    },
    {
        name: 'seq.nth_i', theory: 'Z3 Sequences', z3Only: true, ranks: ['String Int -> Unicode', '(Seq A) Int -> A'],
        doc: 'Internal interpreted variant of `seq.nth` for in-range indices.'
    },
    {
        name: 'seq.nth_u', theory: 'Z3 Sequences', z3Only: true, ranks: ['String Int -> Unicode', '(Seq A) Int -> A'],
        doc: 'Internal uninterpreted variant of `seq.nth` for out-of-range indices.'
    },
    { name: 'seq.contains', theory: 'Z3 Sequences', z3Only: true, ranks: ['String String -> Bool', '(Seq A) (Seq A) -> Bool'], doc: '`(seq.contains s t)` is true iff `t` is a contiguous subsequence of `s`.' },
    { name: 'seq.prefixof', theory: 'Z3 Sequences', z3Only: true, ranks: ['String String -> Bool', '(Seq A) (Seq A) -> Bool'], doc: '`(seq.prefixof s t)` is true iff `s` is a prefix of `t`.' },
    { name: 'seq.suffixof', theory: 'Z3 Sequences', z3Only: true, ranks: ['String String -> Bool', '(Seq A) (Seq A) -> Bool'], doc: '`(seq.suffixof s t)` is true iff `s` is a suffix of `t`.' },
    {
        name: 'seq.indexof', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String String Int -> Int', 'String String -> Int', '(Seq A) (Seq A) Int -> Int', '(Seq A) (Seq A) -> Int'],
        doc: '`(seq.indexof s t i)` is the first position >= `i` (default 0) where `t` occurs in `s`, or -1.'
    },
    {
        name: 'seq.last_indexof', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String String -> Int', '(Seq A) (Seq A) -> Int'],
        doc: '`(seq.last_indexof s t)` is the last position where `t` occurs in `s`, or -1.'
    },
    {
        name: 'seq.replace', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String String String -> String', '(Seq A) (Seq A) (Seq A) -> (Seq A)'],
        doc: '`(seq.replace s t u)` replaces the first occurrence of `t` in `s` by `u`.'
    },
    {
        name: 'seq.replace_all', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String String String -> String', '(Seq A) (Seq A) (Seq A) -> (Seq A)'],
        doc: '`(seq.replace_all s t u)` replaces all non-overlapping occurrences of `t` in `s` by `u`.'
    },
    {
        name: 'seq.replace_re', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String RegLan String -> String', '(Seq A) (RegEx (Seq A)) (Seq A) -> (Seq A)'],
        doc: 'Sequence version of `str.replace_re`: replaces the shortest leftmost match of the regex by `u`.'
    },
    {
        name: 'seq.replace_re_all', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String RegLan String -> String', '(Seq A) (RegEx (Seq A)) (Seq A) -> (Seq A)'],
        doc: 'Sequence version of `str.replace_re_all`: replaces every shortest match of the regex by `u`.'
    },
    {
        name: 'seq.power', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String Int -> String', '(Seq A) Int -> (Seq A)'],
        doc: '`(seq.power s n)` is `s` concatenated with itself `n` times.'
    },
    {
        name: 'seq.to.re', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String -> RegLan', '(Seq A) -> (RegEx (Seq A))'],
        doc: 'Regular expression matching exactly the given sequence.'
    },
    {
        name: 'seq.in.re', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['String RegLan -> Bool', '(Seq A) (RegEx (Seq A)) -> Bool'],
        doc: '`(seq.in.re s r)` is true iff `s` is in the language of `r`.'
    },
    {
        name: 'seq.map', theory: 'Z3 Sequences', z3Only: true,
        ranks: [
            '(Array Unicode Unicode) String -> String',
            '(Array Unicode B) String -> (Seq B)',
            '(Array A Unicode) (Seq A) -> String',
            '(Array A B) (Seq A) -> (Seq B)',
        ],
        doc: '`(seq.map f s)` applies the function (array or lambda) `f` to every element of `s`.'
    },
    {
        name: 'seq.mapi', theory: 'Z3 Sequences', z3Only: true,
        ranks: [
            '(Array Int Unicode Unicode) Int String -> String',
            '(Array Int Unicode B) Int String -> (Seq B)',
            '(Array Int A Unicode) Int (Seq A) -> String',
            '(Array Int A B) Int (Seq A) -> (Seq B)',
        ],
        doc: '`(seq.mapi f i s)` applies `f` to each element together with its index, starting at offset `i`.'
    },
    {
        name: 'seq.foldl', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['(Array B Unicode B) B String -> B', '(Array B A B) B (Seq A) -> B'],
        doc: '`(seq.foldl f b s)` folds `f` over `s` from the left, starting with accumulator `b`.'
    },
    {
        name: 'seq.fold_left', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['(Array B Unicode B) B String -> B', '(Array B A B) B (Seq A) -> B'],
        doc: 'Alias of `seq.foldl`: left fold of `f` over a sequence starting with accumulator `b`.'
    },
    {
        name: 'seq.foldli', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['(Array Int B Unicode B) Int B String -> B', '(Array Int B A B) Int B (Seq A) -> B'],
        doc: '`(seq.foldli f i b s)` left fold where `f` also receives the element index, starting at offset `i`.'
    },
    {
        name: 'seq.fold_lefti', theory: 'Z3 Sequences', z3Only: true,
        ranks: ['(Array Int B Unicode B) Int B String -> B', '(Array Int B A B) Int B (Seq A) -> B'],
        doc: 'Alias of `seq.foldli`: indexed left fold over a sequence.'
    },

    // =====================================================================
    // Z3 Characters
    // =====================================================================
    {
        name: 'Char', theory: 'Z3 Characters', z3Only: true, indices: ['n'],
        ranks: ['-> Unicode'],
        doc: '`(_ Char n)` is the character with code point `n`.'
    },
    { name: 'char.<=', theory: 'Z3 Characters', z3Only: true, ranks: ['Unicode Unicode -> Bool'], doc: 'Code-point order on characters.' },
    { name: 'char.to_int', theory: 'Z3 Characters', z3Only: true, ranks: ['Unicode -> Int'], doc: 'Code point of a character.' },
    { name: 'char.is_digit', theory: 'Z3 Characters', z3Only: true, ranks: ['Unicode -> Bool'], doc: 'True iff the character is one of "0" to "9".' },
    {
        name: 'char.to_bv', theory: 'Z3 Characters', z3Only: true, ranks: ['Unicode -> (_ BitVec 18)'],
        doc: 'Code point of a character as a bit-vector (18 bits with the default unicode encoding; 16 for bmp, 8 for ascii).'
    },
    {
        name: 'char.from_bv', theory: 'Z3 Characters', z3Only: true, ranks: ['(_ BitVec 18) -> Unicode'],
        doc: 'Character with the given code point (18-bit bit-vector with the default unicode encoding; 16 for bmp, 8 for ascii).'
    },

    // =====================================================================
    // Z3 Finite Fields
    // =====================================================================
    {
        name: 'ff.add', theory: 'Z3 Finite Fields', z3Only: true,
        ranks: ['(_ FiniteField p) (_ FiniteField p)+ -> (_ FiniteField p)'],
        doc: 'Addition modulo p (n-ary, associative, commutative).'
    },
    {
        name: 'ff.mul', theory: 'Z3 Finite Fields', z3Only: true,
        ranks: ['(_ FiniteField p) (_ FiniteField p)+ -> (_ FiniteField p)'],
        doc: 'Multiplication modulo p (n-ary, associative, commutative).'
    },
    {
        name: 'ff.neg', theory: 'Z3 Finite Fields', z3Only: true,
        ranks: ['(_ FiniteField p) -> (_ FiniteField p)'],
        doc: 'Additive inverse modulo p.'
    },
    {
        name: 'ff.bitsum', theory: 'Z3 Finite Fields', z3Only: true,
        ranks: ['(_ FiniteField p) (_ FiniteField p)+ -> (_ FiniteField p)'],
        doc: '`(ff.bitsum x0 x1 ... xn)` is the weighted sum x0 + 2*x1 + ... + 2^n*xn (positional, not commutative).'
    },

    // =====================================================================
    // Z3 Finite Sets
    // =====================================================================
    {
        name: 'set.empty', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['-> (FiniteSet A)'],
        doc: 'The empty finite set; needs a sort ascription, e.g. `(as set.empty (FiniteSet Int))`.'
    },
    { name: 'set.singleton', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['A -> (FiniteSet A)'], doc: 'Finite set containing exactly the given element.' },
    {
        name: 'set.union', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(FiniteSet A) (FiniteSet A)+ -> (FiniteSet A)'], doc: 'Union of finite sets.'
    },
    {
        name: 'set.intersect', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(FiniteSet A) (FiniteSet A)+ -> (FiniteSet A)'], doc: 'Intersection of finite sets.'
    },
    {
        name: 'set.difference', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(FiniteSet A) (FiniteSet A) -> (FiniteSet A)'], doc: '`(set.difference s t)` contains the elements of `s` that are not in `t`.'
    },
    { name: 'set.in', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['A (FiniteSet A) -> Bool'], doc: '`(set.in x s)` is true iff `x` is an element of `s`.' },
    { name: 'set.size', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['(FiniteSet A) -> Int'], doc: 'Number of elements (cardinality) of a finite set.' },
    { name: 'set.subset', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['(FiniteSet A) (FiniteSet A) -> Bool'], doc: '`(set.subset s t)` is true iff every element of `s` is in `t`.' },
    {
        name: 'set.map', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(Array A B) (FiniteSet A) -> (FiniteSet B)'], doc: '`(set.map f s)` is the image of `s` under the function (array or lambda) `f`.'
    },
    {
        name: 'set.filter', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(Array A Bool) (FiniteSet A) -> (FiniteSet A)'], doc: '`(set.filter p s)` is the subset of elements of `s` satisfying predicate `p`.'
    },
    { name: 'set.range', theory: 'Z3 Finite Sets', z3Only: true, ranks: ['Int Int -> (FiniteSet Int)'], doc: '`(set.range lo hi)` is the set of integers from `lo` to `hi` (inclusive).' },
    {
        name: 'set.diff', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(FiniteSet A) (FiniteSet A) -> A'], doc: 'Extensionality witness: an element on which the two sets differ (if they differ).'
    },
    {
        name: 'set.map.inverse', theory: 'Z3 Finite Sets', z3Only: true,
        ranks: ['(Array A B) B (FiniteSet A) -> A'], doc: '`(set.map.inverse f y s)` is a pre-image witness: an element of `s` mapped by `f` to `y` (if one exists).'
    },
];
