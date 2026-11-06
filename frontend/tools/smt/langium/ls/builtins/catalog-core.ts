/**
 * Builtin catalog: Core, Ints, Reals, Reals_Ints, ArraysEx, FixedSizeBitVectors,
 * Datatypes, HO-Core and the corresponding Z3 extensions (arithmetic, arrays & sets,
 * bit-vectors, pseudo-Booleans, special relations).
 *
 * Derived from the SMT-LIB 2.7 theory definitions and Z3's decl plugins
 * (ast.cpp, arith_decl_plugin.cpp, array_decl_plugin.cpp, bv_decl_plugin.cpp,
 * datatype_decl_plugin.cpp, pb_decl_plugin.cpp, special_relations_decl_plugin.cpp,
 * recfun_decl_plugin.cpp) and the SMT2 parser.
 */
import type { BuiltinFunctionSpec, BuiltinSortSpec } from './types.js';

export const coreSorts: BuiltinSortSpec[] = [
    // ----- Core -----
    { name: 'Bool', theory: 'Core', arity: 0, doc: 'The sort of Boolean values `true` and `false`.' },
    { name: 'bool', theory: 'Z3 Core', arity: 0, alias: 'Bool', z3Only: true, doc: 'Z3 alias for `Bool` (only when no logic is set).' },
    { name: 'Proof', theory: 'Z3 Core', arity: 0, z3Only: true, doc: 'Z3 internal sort of proof objects (only when no logic is set).' },

    // ----- Arithmetic -----
    { name: 'Int', theory: 'Ints', arity: 0, doc: 'The sort of mathematical (unbounded) integers.' },
    { name: 'Real', theory: 'Reals', arity: 0, doc: 'The sort of real numbers.' },
    { name: 'Complex', theory: 'Z3 Arithmetic', arity: 0, z3Only: true, doc: 'Z3 sort of complex numbers (only when no logic is set or logic is ALL).' },

    // ----- Arrays -----
    { name: 'Array', theory: 'ArraysEx', arity: 2, doc: '`(Array X Y)` is the sort of arrays with index sort X and element sort Y. Z3 also accepts multi-dimensional arrays `(Array X1 ... Xn Y)`.' },
    { name: '=>', theory: 'Z3 Arrays & Sets', arity: 2, z3Only: true, doc: 'Z3 alias for the `Array` sort constructor: `(=> X Y)` is `(Array X Y)`.' },
    { name: 'Set', theory: 'Z3 Arrays & Sets', arity: 1, z3Only: true, doc: '`(Set X)` is Z3\'s array-based set sort, an abbreviation of `(Array X Bool)`.' },

    // ----- Z3 predefined list datatype -----
    { name: 'List', theory: 'Z3 Datatypes', arity: 1, z3Only: true, doc: 'Z3\'s predefined parametric list datatype with constructors `nil` and `(insert head tail)` (only when no logic is set).' },

    // ----- HO-Core -----
    { name: '->', theory: 'HO-Core', arity: 2, doc: '`(-> A B)` is the sort of functions from A to B (SMT-LIB 2.7). Z3 treats it as an alias of `(Array A B)`.' },

    // ----- Bit-vectors -----
    { name: 'BitVec', theory: 'FixedSizeBitVectors', arity: 0, indices: ['m'], doc: '`(_ BitVec m)` is the sort of bit-vectors of width m > 0.' },
    { name: 'bv', theory: 'Z3 Bit-Vectors', arity: 0, indices: ['m'], alias: '(_ BitVec m)', z3Only: true, doc: 'Z3 alias: `(_ bv m)` is `(_ BitVec m)` (only when no logic is set or logic is ALL).' },
];

const BV = '(_ BitVec m)';
const bvBinary = `${BV} ${BV} -> ${BV}`;
const bvAssoc = `${BV} ${BV}+ -> ${BV}`;
const bvUnary = `${BV} -> ${BV}`;
const bvPred = `${BV} ${BV} -> Bool`;
const SET = '(Array X Bool)';

export const coreFunctions: BuiltinFunctionSpec[] = [
    // =====================================================================
    // Core
    // =====================================================================
    { name: 'true', theory: 'Core', ranks: ['-> Bool'], doc: 'The Boolean constant true.' },
    { name: 'false', theory: 'Core', ranks: ['-> Bool'], doc: 'The Boolean constant false.' },
    { name: 'not', theory: 'Core', ranks: ['Bool -> Bool'], doc: 'Boolean negation.' },
    { name: '=>', theory: 'Core', ranks: ['Bool Bool+ -> Bool'], doc: 'Boolean implication (right-associative).' },
    { name: 'and', theory: 'Core', ranks: ['Bool* -> Bool'], doc: 'Boolean conjunction.' },
    { name: 'or', theory: 'Core', ranks: ['Bool* -> Bool'], doc: 'Boolean disjunction.' },
    { name: 'xor', theory: 'Core', ranks: ['Bool Bool+ -> Bool'], doc: 'Boolean exclusive or (left-associative).' },
    { name: '=', theory: 'Core', ranks: ['A A+ -> Bool'], doc: 'Equality of two or more terms of the same sort (chainable).' },
    { name: 'distinct', theory: 'Core', ranks: ['A A+ -> Bool'], doc: 'True iff all arguments are pairwise different.' },
    { name: 'ite', theory: 'Core', ranks: ['Bool A A -> A'], doc: '`(ite c t e)` is t if c holds and e otherwise.' },

    // ----- Z3 Core aliases -----
    { name: 'if', theory: 'Z3 Core', ranks: ['Bool A A -> A'], z3Only: true, doc: 'Z3 alias for `ite`.' },
    { name: 'if_then_else', theory: 'Z3 Core', ranks: ['Bool A A -> A'], z3Only: true, doc: 'Z3 alias for `ite` (only when no logic is set).' },
    { name: 'implies', theory: 'Z3 Core', ranks: ['Bool Bool+ -> Bool'], z3Only: true, doc: 'Z3 alias for `=>` (only when no logic is set).' },
    { name: 'iff', theory: 'Z3 Core', ranks: ['A A+ -> Bool'], z3Only: true, doc: 'Z3 alias for `=`, typically used on Booleans (only when no logic is set).' },
    { name: 'equals', theory: 'Z3 Core', ranks: ['A A+ -> Bool'], z3Only: true, doc: 'Z3 alias for `=` (only when no logic is set).' },
    { name: 'equiv', theory: 'Z3 Core', ranks: ['A A+ -> Bool'], z3Only: true, doc: 'Z3 alias for `=` (only when no logic is set).' },
    { name: '&&', theory: 'Z3 Core', ranks: ['Bool* -> Bool'], z3Only: true, doc: 'Z3 alias for `and` (only when no logic is set).' },

    // ----- Z3 recursive-function internals -----
    { name: 'case-def', theory: 'Z3 Core', ranks: ['?* -> Bool'], z3Only: true, doc: 'Z3-internal predicate marking a case of a recursive function definition; not meant for user input.' },
    { name: 'recfun-num-rounds', theory: 'Z3 Core', ranks: ['-> Bool'], z3Only: true, doc: 'Z3-internal unfolding-depth marker for recursive functions; not meant for user input.' },

    // =====================================================================
    // Ints / Reals / Reals_Ints
    // =====================================================================
    { name: '+', theory: 'Reals_Ints', ranks: ['Int Int* -> Int', 'Real Real* -> Real', 'Complex Complex* -> Complex'], doc: 'Addition (left-associative).' },
    { name: '-', theory: 'Reals_Ints', ranks: ['Int Int* -> Int', 'Real Real* -> Real', 'Complex Complex* -> Complex'], doc: 'Subtraction (left-associative); with one argument, arithmetic negation.' },
    { name: '*', theory: 'Reals_Ints', ranks: ['Int Int* -> Int', 'Real Real* -> Real', 'Complex Complex* -> Complex', 'Real Complex -> Complex', 'Complex Real -> Complex'], doc: 'Multiplication (left-associative).' },
    { name: '/', theory: 'Reals', ranks: ['Real Real+ -> Real', 'Complex Complex+ -> Complex'], doc: 'Real division (left-associative). Division by zero is unspecified; Z3 coerces Int arguments to Real.' },
    { name: 'div', theory: 'Ints', ranks: ['Int Int+ -> Int'], doc: 'Integer division (left-associative), Euclidean: the remainder is always non-negative.' },
    { name: 'mod', theory: 'Ints', ranks: ['Int Int -> Int'], doc: 'Integer modulus; the result is always non-negative for a non-zero divisor.' },
    { name: 'abs', theory: 'Ints', ranks: ['Int -> Int', 'Real -> Real'], doc: 'Absolute value. SMT-LIB defines it on Int; Z3 also accepts Real.' },
    { name: '<', theory: 'Reals_Ints', ranks: ['Int Int+ -> Bool', 'Real Real+ -> Bool'], doc: 'Less-than (chainable).' },
    { name: '<=', theory: 'Reals_Ints', ranks: ['Int Int+ -> Bool', 'Real Real+ -> Bool'], doc: 'Less-than-or-equal (chainable).' },
    { name: '>', theory: 'Reals_Ints', ranks: ['Int Int+ -> Bool', 'Real Real+ -> Bool'], doc: 'Greater-than (chainable).' },
    { name: '>=', theory: 'Reals_Ints', ranks: ['Int Int+ -> Bool', 'Real Real+ -> Bool'], doc: 'Greater-than-or-equal (chainable).' },
    { name: 'to_real', theory: 'Reals_Ints', ranks: ['Int -> Real', 'Real -> Real'], doc: 'Converts an integer to the equal real number.' },
    { name: 'to_int', theory: 'Reals_Ints', ranks: ['Real -> Int', 'Int -> Int'], doc: 'Floor: the largest integer not greater than the argument.' },
    { name: 'is_int', theory: 'Reals_Ints', ranks: ['Real -> Bool'], doc: 'True iff the real argument is an integer.' },
    { name: 'divisible', theory: 'Ints', indices: ['n'], ranks: ['Int -> Bool'], doc: '`((_ divisible n) x)` holds iff x is divisible by n > 0. Z3 only registers it with `smtlib2_compliant=true`.' },

    // ----- Z3 arithmetic extras -----
    { name: '~', theory: 'Z3 Arithmetic', ranks: ['Int -> Int', 'Real -> Real'], z3Only: true, doc: 'Z3 alias for unary minus.' },
    { name: 'rem', theory: 'Z3 Arithmetic', ranks: ['Int Int -> Int'], z3Only: true, doc: 'Integer remainder; its sign follows the divisor.' },
    { name: '^', theory: 'Z3 Arithmetic', ranks: ['Int Int -> Int', 'Real Real -> Real'], z3Only: true, doc: 'Exponentiation (non-linear).' },
    { name: '**', theory: 'Z3 Arithmetic', ranks: ['Int Int -> Int', 'Real Real -> Real'], z3Only: true, doc: 'Z3 alias for exponentiation `^`.' },
    { name: '/0', theory: 'Z3 Arithmetic', ranks: ['Real Real -> Real'], z3Only: true, doc: 'Uninterpreted value of real division by zero.' },
    { name: 'div0', theory: 'Z3 Arithmetic', ranks: ['Int Int -> Int'], z3Only: true, doc: 'Uninterpreted value of integer division by zero.' },
    { name: 'mod0', theory: 'Z3 Arithmetic', ranks: ['Int Int -> Int'], z3Only: true, doc: 'Uninterpreted value of integer modulus by zero.' },
    { name: 'sin', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Sine (transcendental; limited solver support).' },
    { name: 'cos', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Cosine (transcendental; limited solver support).' },
    { name: 'tan', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Tangent (transcendental; limited solver support).' },
    { name: 'asin', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Arc sine (transcendental; limited solver support).' },
    { name: 'acos', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Arc cosine (transcendental; limited solver support).' },
    { name: 'atan', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Arc tangent (transcendental; limited solver support).' },
    { name: 'sinh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Hyperbolic sine (transcendental; limited solver support).' },
    { name: 'cosh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Hyperbolic cosine (transcendental; limited solver support).' },
    { name: 'tanh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Hyperbolic tangent (transcendental; limited solver support).' },
    { name: 'asinh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Inverse hyperbolic sine (transcendental; limited solver support).' },
    { name: 'acosh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Inverse hyperbolic cosine (transcendental; limited solver support).' },
    { name: 'atanh', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Inverse hyperbolic tangent (transcendental; limited solver support).' },
    { name: 'exp', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Natural exponential function e^x.' },
    { name: 'log', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Natural logarithm.' },
    { name: 'ln', theory: 'Z3 Arithmetic', ranks: ['Real -> Real'], z3Only: true, doc: 'Z3 alias for `log` (natural logarithm).' },
    { name: 'atan2', theory: 'Z3 Arithmetic', ranks: ['Real Real -> Real'], z3Only: true, doc: 'Two-argument arc tangent `(atan2 y x)`.' },
    { name: 'arctan2', theory: 'Z3 Arithmetic', ranks: ['Real Real -> Real'], z3Only: true, doc: 'Z3 alias for `atan2`.' },
    { name: 'pi', theory: 'Z3 Arithmetic', ranks: ['-> Real'], z3Only: true, doc: 'The constant π.' },
    { name: 'euler', theory: 'Z3 Arithmetic', ranks: ['-> Real'], z3Only: true, doc: 'Euler\'s number e.' },
    { name: 'root-obj', theory: 'Z3 Arithmetic', ranks: ['? Int -> Real'], z3Only: true, doc: '`(root-obj p i)` denotes the i-th (1-based) real root of the univariate polynomial p (an s-expression over one free variable). Parsed as special syntax by Z3; mostly seen in Z3 model output.' },
    { name: 'complex.make', theory: 'Z3 Arithmetic', ranks: ['Real Real -> Complex'], z3Only: true, doc: 'Builds a complex number from its real and imaginary parts.' },
    { name: 'complex.real', theory: 'Z3 Arithmetic', ranks: ['Complex -> Real'], z3Only: true, doc: 'Real part of a complex number.' },
    { name: 'complex.imag', theory: 'Z3 Arithmetic', ranks: ['Complex -> Real'], z3Only: true, doc: 'Imaginary part of a complex number.' },

    // =====================================================================
    // ArraysEx
    // =====================================================================
    { name: 'select', theory: 'ArraysEx', ranks: ['(Array X Y) X -> Y'], doc: '`(select a i)` reads the element of array a at index i.' },
    { name: 'store', theory: 'ArraysEx', ranks: ['(Array X Y) X Y -> (Array X Y)'], doc: '`(store a i v)` is the array a with index i updated to v.' },

    // ----- Z3 array & set extras -----
    { name: 'const', theory: 'Z3 Arrays & Sets', ranks: ['Y -> (Array X Y)'], z3Only: true, doc: 'Constant array, used as `((as const (Array X Y)) v)`: every index maps to v.' },
    { name: 'default', theory: 'Z3 Arrays & Sets', ranks: ['(Array X Y) -> Y'], z3Only: true, doc: 'The default (else) value of an array.' },
    { name: 'map', theory: 'Z3 Arrays & Sets', indices: ['f'], symbolIndices: ['f'], ranks: ['?+ -> ?'], z3Only: true, doc: '`((_ map f) a1 ... an)` applies the n-ary function f pointwise to arrays with the same index sort.' },
    { name: 'as-array', theory: 'Z3 Arrays & Sets', indices: ['f'], symbolIndices: ['f'], ranks: ['-> ?'], z3Only: true, doc: '`(_ as-array f)` is the array whose value at each index is f applied to that index.' },
    { name: 'array-ext', theory: 'Z3 Arrays & Sets', ranks: ['(Array X Y) (Array X Y) -> X'], z3Only: true, doc: 'Extensionality witness: an index where two arrays differ, if they differ.' },
    { name: 'array-ext', theory: 'Z3 Arrays & Sets', indices: ['i'], ranks: ['A A -> ?'], z3Only: true, doc: '`((_ array-ext i) a b)`: the i-th index component of an extensionality witness for multi-dimensional arrays.' },
    { name: 'choice', theory: 'Z3 Arrays & Sets', ranks: [`${SET} -> X`], z3Only: true, doc: 'Picks an element of a non-empty set. Note: Z3\'s parser treats `(choice ((x S)) body)` as a binder.' },
    { name: 'union', theory: 'Z3 Arrays & Sets', ranks: [`${SET} ${SET}* -> ${SET}`], z3Only: true, doc: 'Union of sets represented as `(Array X Bool)`.' },
    { name: 'intersection', theory: 'Z3 Arrays & Sets', ranks: [`${SET} ${SET}* -> ${SET}`], z3Only: true, doc: 'Intersection of sets represented as `(Array X Bool)`.' },
    { name: 'setminus', theory: 'Z3 Arrays & Sets', ranks: [`${SET} ${SET} -> ${SET}`], z3Only: true, doc: 'Set difference of sets represented as `(Array X Bool)`.' },
    { name: 'complement', theory: 'Z3 Arrays & Sets', ranks: [`${SET} -> ${SET}`], z3Only: true, doc: 'Complement of a set represented as `(Array X Bool)`.' },
    { name: 'subset', theory: 'Z3 Arrays & Sets', ranks: [`${SET} ${SET} -> Bool`], z3Only: true, doc: 'True iff the first set is a subset of the second.' },

    // =====================================================================
    // FixedSizeBitVectors
    // =====================================================================
    { name: 'bv', theory: 'FixedSizeBitVectors', indices: ['m'], ranks: ['-> (_ BitVec m)'], doc: '`(_ bvN m)` is the bit-vector literal of width m with unsigned value N (N in decimal), e.g. `(_ bv5 8)`.' },
    { name: 'concat', theory: 'FixedSizeBitVectors', ranks: ['(_ BitVec i) (_ BitVec j) -> (_ BitVec {i+j})', '(_ BitVec i) (_ BitVec j) ?+ -> ?'], doc: 'Concatenation; the first argument supplies the most significant bits. Z3 also accepts more than two arguments.' },
    { name: 'extract', theory: 'FixedSizeBitVectors', indices: ['i', 'j'], ranks: ['(_ BitVec m) -> (_ BitVec {i-j+1})'], doc: '`((_ extract i j) x)` returns bits i down to j of x (m > i >= j >= 0).' },
    { name: 'repeat', theory: 'FixedSizeBitVectors', indices: ['i'], ranks: ['(_ BitVec m) -> (_ BitVec {i*m})'], doc: '`((_ repeat i) x)` concatenates i copies of x.' },
    { name: 'zero_extend', theory: 'FixedSizeBitVectors', indices: ['i'], ranks: ['(_ BitVec m) -> (_ BitVec {m+i})'], doc: '`((_ zero_extend i) x)` extends x with i zero bits on the left.' },
    { name: 'sign_extend', theory: 'FixedSizeBitVectors', indices: ['i'], ranks: ['(_ BitVec m) -> (_ BitVec {m+i})'], doc: '`((_ sign_extend i) x)` extends x with i copies of its sign bit.' },
    { name: 'rotate_left', theory: 'FixedSizeBitVectors', indices: ['i'], ranks: [bvUnary], doc: '`((_ rotate_left i) x)` rotates x left by i bits.' },
    { name: 'rotate_right', theory: 'FixedSizeBitVectors', indices: ['i'], ranks: [bvUnary], doc: '`((_ rotate_right i) x)` rotates x right by i bits.' },
    { name: 'bvnot', theory: 'FixedSizeBitVectors', ranks: [bvUnary], doc: 'Bitwise negation.' },
    { name: 'bvand', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Bitwise and (left-associative).' },
    { name: 'bvor', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Bitwise or (left-associative).' },
    { name: 'bvxor', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Bitwise exclusive or (left-associative).' },
    { name: 'bvnand', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Bitwise nand.' },
    { name: 'bvnor', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Bitwise nor.' },
    { name: 'bvxnor', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Bitwise exclusive nor.' },
    { name: 'bvcomp', theory: 'FixedSizeBitVectors', ranks: [`${BV} ${BV} -> (_ BitVec 1)`], doc: 'Bit-vector comparison: `#b1` if the arguments are equal, `#b0` otherwise.' },
    { name: 'bvneg', theory: 'FixedSizeBitVectors', ranks: [bvUnary], doc: 'Two\'s complement negation.' },
    { name: 'bvadd', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Addition modulo 2^m (left-associative).' },
    { name: 'bvsub', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Subtraction modulo 2^m.' },
    { name: 'bvmul', theory: 'FixedSizeBitVectors', ranks: [bvAssoc], doc: 'Multiplication modulo 2^m (left-associative).' },
    { name: 'bvudiv', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Unsigned division; division by zero yields all ones.' },
    { name: 'bvurem', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Unsigned remainder; remainder by zero yields the dividend.' },
    { name: 'bvsdiv', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Signed division, rounding towards zero.' },
    { name: 'bvsrem', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Signed remainder; the sign follows the dividend.' },
    { name: 'bvsmod', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Signed modulus; the sign follows the divisor.' },
    { name: 'bvshl', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Shift left (the second argument is the shift amount).' },
    { name: 'bvlshr', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Logical shift right (fills with zeros).' },
    { name: 'bvashr', theory: 'FixedSizeBitVectors', ranks: [bvBinary], doc: 'Arithmetic shift right (fills with the sign bit).' },
    { name: 'bvult', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Unsigned less-than on bit-vectors.' },
    { name: 'bvule', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Unsigned less-than-or-equal on bit-vectors.' },
    { name: 'bvugt', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Unsigned greater-than on bit-vectors.' },
    { name: 'bvuge', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Unsigned greater-than-or-equal on bit-vectors.' },
    { name: 'bvslt', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Signed (two\'s complement) less-than on bit-vectors.' },
    { name: 'bvsle', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Signed (two\'s complement) less-than-or-equal on bit-vectors.' },
    { name: 'bvsgt', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Signed (two\'s complement) greater-than on bit-vectors.' },
    { name: 'bvsge', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'Signed (two\'s complement) greater-than-or-equal on bit-vectors.' },

    // ----- SMT-LIB 2.7 additions -----
    { name: 'ubv_to_int', theory: 'FixedSizeBitVectors', ranks: [`${BV} -> Int`], doc: 'The non-negative integer denoted by a bit-vector read as unsigned (SMT-LIB 2.7).' },
    { name: 'sbv_to_int', theory: 'FixedSizeBitVectors', ranks: [`${BV} -> Int`], doc: 'The integer denoted by a bit-vector read in two\'s complement (SMT-LIB 2.7).' },
    { name: 'int_to_bv', theory: 'FixedSizeBitVectors', indices: ['m'], ranks: ['Int -> (_ BitVec m)'], doc: '`((_ int_to_bv m) x)` is x modulo 2^m as a bit-vector of width m (SMT-LIB 2.7).' },
    { name: 'bvnego', theory: 'FixedSizeBitVectors', ranks: [`${BV} -> Bool`], doc: 'True iff negating the argument overflows (signed).' },
    { name: 'bvuaddo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff unsigned addition overflows.' },
    { name: 'bvsaddo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff signed addition overflows.' },
    { name: 'bvumulo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff unsigned multiplication overflows.' },
    { name: 'bvsmulo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff signed multiplication overflows.' },
    { name: 'bvusubo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff unsigned subtraction underflows.' },
    { name: 'bvssubo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff signed subtraction overflows.' },
    { name: 'bvsdivo', theory: 'FixedSizeBitVectors', ranks: [bvPred], doc: 'True iff signed division overflows (minimum value divided by -1).' },

    // ----- Z3 bit-vector extras -----
    { name: 'bit0', theory: 'Z3 Bit-Vectors', ranks: ['-> (_ BitVec 1)'], z3Only: true, doc: 'The 1-bit vector `#b0`.' },
    { name: 'bit1', theory: 'Z3 Bit-Vectors', ranks: ['-> (_ BitVec 1)'], z3Only: true, doc: 'The 1-bit vector `#b1`.' },
    { name: 'bvredor', theory: 'Z3 Bit-Vectors', ranks: [`${BV} -> (_ BitVec 1)`], z3Only: true, doc: 'Or-reduction: `#b1` iff some bit is set.' },
    { name: 'bvredand', theory: 'Z3 Bit-Vectors', ranks: [`${BV} -> (_ BitVec 1)`], z3Only: true, doc: 'And-reduction: `#b1` iff all bits are set.' },
    { name: 'ext_rotate_left', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Rotate left by an amount given as a bit-vector term.' },
    { name: 'ext_rotate_right', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Rotate right by an amount given as a bit-vector term.' },
    { name: 'bit2bool', theory: 'Z3 Bit-Vectors', indices: ['i'], ranks: [`${BV} -> Bool`], z3Only: true, doc: '`((_ bit2bool i) x)` is true iff bit i of x is 1.' },
    { name: 'mkbv', theory: 'Z3 Bit-Vectors', ranks: ['Bool+ -> ?'], z3Only: true, doc: 'Builds a bit-vector of width n from n Boolean arguments.' },
    { name: 'int2bv', theory: 'Z3 Bit-Vectors', indices: ['m'], ranks: ['Int -> (_ BitVec m)'], z3Only: true, doc: 'Z3 alias for `int_to_bv`: `((_ int2bv m) x)` is x modulo 2^m.' },
    { name: 'bv2int', theory: 'Z3 Bit-Vectors', ranks: [`${BV} -> Int`], z3Only: true, doc: 'Z3 alias for `ubv_to_int` (unsigned value).' },
    { name: 'bv2nat', theory: 'Z3 Bit-Vectors', ranks: [`${BV} -> Int`], z3Only: true, doc: 'Z3 alias for `ubv_to_int` (unsigned value).' },
    { name: 'bvumul_noovfl', theory: 'Z3 Bit-Vectors', ranks: [bvPred], z3Only: true, doc: 'True iff unsigned multiplication does not overflow.' },
    { name: 'bvsmul_noovfl', theory: 'Z3 Bit-Vectors', ranks: [bvPred], z3Only: true, doc: 'True iff signed multiplication does not overflow.' },
    { name: 'bvsmul_noudfl', theory: 'Z3 Bit-Vectors', ranks: [bvPred], z3Only: true, doc: 'True iff signed multiplication does not underflow.' },
    { name: 'bvsdiv_i', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Signed division assuming a non-zero divisor (Z3 internal variant of `bvsdiv`).' },
    { name: 'bvudiv_i', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Unsigned division assuming a non-zero divisor (Z3 internal variant of `bvudiv`).' },
    { name: 'bvsrem_i', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Signed remainder assuming a non-zero divisor (Z3 internal variant of `bvsrem`).' },
    { name: 'bvurem_i', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Unsigned remainder assuming a non-zero divisor (Z3 internal variant of `bvurem`).' },
    { name: 'bvsmod_i', theory: 'Z3 Bit-Vectors', ranks: [bvBinary], z3Only: true, doc: 'Signed modulus assuming a non-zero divisor (Z3 internal variant of `bvsmod`).' },
    { name: 'bvsdiv0', theory: 'Z3 Bit-Vectors', ranks: [bvUnary], z3Only: true, doc: 'Value of `bvsdiv` of the argument by zero.' },
    { name: 'bvudiv0', theory: 'Z3 Bit-Vectors', ranks: [bvUnary], z3Only: true, doc: 'Value of `bvudiv` of the argument by zero.' },
    { name: 'bvsrem0', theory: 'Z3 Bit-Vectors', ranks: [bvUnary], z3Only: true, doc: 'Value of `bvsrem` of the argument by zero.' },
    { name: 'bvurem0', theory: 'Z3 Bit-Vectors', ranks: [bvUnary], z3Only: true, doc: 'Value of `bvurem` of the argument by zero.' },
    { name: 'bvsmod0', theory: 'Z3 Bit-Vectors', ranks: [bvUnary], z3Only: true, doc: 'Value of `bvsmod` of the argument by zero.' },

    // =====================================================================
    // Datatypes
    // =====================================================================
    { name: 'is', theory: 'Datatypes', indices: ['c'], symbolIndices: ['c'], ranks: ['? -> Bool'], doc: '`((_ is C) t)` is true iff t was built with constructor C.' },
    { name: 'update-field', theory: 'Datatypes', indices: ['f'], symbolIndices: ['f'], ranks: ['A ? -> A'], z3Only: true, doc: '`((_ update-field acc) t v)` is t with the field selected by accessor acc replaced by v (Z3 extension).' },

    // =====================================================================
    // HO-Core (SMT-LIB 2.7)
    // =====================================================================
    { name: '@', theory: 'HO-Core', ranks: ['(-> A B) A -> B'], doc: 'Function application `(@ f x)` (SMT-LIB 2.7 HO-Core). Not supported by Z3, which applies function-valued terms directly or via `select`.' },

    // =====================================================================
    // Z3 Pseudo-Boolean
    // =====================================================================
    { name: 'at-most', theory: 'Z3 Pseudo-Boolean', indices: ['k'], ranks: ['Bool* -> Bool'], z3Only: true, doc: '`((_ at-most k) b1 ... bn)` holds iff at most k of the arguments are true.' },
    { name: 'at-least', theory: 'Z3 Pseudo-Boolean', indices: ['k'], ranks: ['Bool* -> Bool'], z3Only: true, doc: '`((_ at-least k) b1 ... bn)` holds iff at least k of the arguments are true.' },
    { name: 'pble', theory: 'Z3 Pseudo-Boolean', indices: ['k', 'c...'], ranks: ['Bool* -> Bool'], z3Only: true, doc: '`((_ pble k c1 ... cn) b1 ... bn)` holds iff c1·b1 + ... + cn·bn <= k. Takes exactly one coefficient per argument.' },
    { name: 'pbge', theory: 'Z3 Pseudo-Boolean', indices: ['k', 'c...'], ranks: ['Bool* -> Bool'], z3Only: true, doc: '`((_ pbge k c1 ... cn) b1 ... bn)` holds iff c1·b1 + ... + cn·bn >= k. Takes exactly one coefficient per argument.' },
    { name: 'pbeq', theory: 'Z3 Pseudo-Boolean', indices: ['k', 'c...'], ranks: ['Bool* -> Bool'], z3Only: true, doc: '`((_ pbeq k c1 ... cn) b1 ... bn)` holds iff c1·b1 + ... + cn·bn = k. Takes exactly one coefficient per argument.' },

    // =====================================================================
    // Z3 Special Relations
    // =====================================================================
    { name: 'linear-order', theory: 'Z3 Special Relations', indices: ['i'], ranks: ['A A -> Bool'], z3Only: true, doc: '`((_ linear-order i) x y)`: the i-th linear order on the sort of x and y.' },
    { name: 'partial-order', theory: 'Z3 Special Relations', indices: ['i'], ranks: ['A A -> Bool'], z3Only: true, doc: '`((_ partial-order i) x y)`: the i-th partial order on the sort of x and y.' },
    { name: 'piecewise-linear-order', theory: 'Z3 Special Relations', indices: ['i'], ranks: ['A A -> Bool'], z3Only: true, doc: '`((_ piecewise-linear-order i) x y)`: the i-th piecewise linear order on the sort of x and y.' },
    { name: 'tree-order', theory: 'Z3 Special Relations', indices: ['i'], ranks: ['A A -> Bool'], z3Only: true, doc: '`((_ tree-order i) x y)`: the i-th tree-like partial order on the sort of x and y.' },
    { name: 'transitive-closure', theory: 'Z3 Special Relations', indices: ['f'], symbolIndices: ['f'], ranks: ['A A -> Bool'], z3Only: true, doc: '`((_ transitive-closure R) x y)`: the transitive closure of the binary relation R.' },
    { name: 'ac-op', theory: 'Z3 Special Relations', indices: ['f'], symbolIndices: ['f'], ranks: ['A A -> A'], z3Only: true, doc: '`((_ ac-op f) x y)`: f treated as an associative-commutative binary operation.' },
    // ----- Z3 predefined list datatype (only when no logic is set) -----
    { name: 'nil', theory: 'Z3 Datatypes', ranks: ['-> (List A)'], z3Only: true, doc: 'The empty list of Z3\'s predefined `List` datatype; use `(as nil (List T))` to fix the element sort.' },
    { name: 'insert', theory: 'Z3 Datatypes', ranks: ['A (List A) -> (List A)'], z3Only: true, doc: 'List constructor of Z3\'s predefined `List` datatype: `(insert head tail)`.' },
    { name: 'head', theory: 'Z3 Datatypes', ranks: ['(List A) -> A'], z3Only: true, doc: 'First element of a non-empty list (Z3\'s predefined `List`).' },
    { name: 'tail', theory: 'Z3 Datatypes', ranks: ['(List A) -> (List A)'], z3Only: true, doc: 'Rest of a non-empty list (Z3\'s predefined `List`).' },
    { name: 'is-nil', theory: 'Z3 Datatypes', ranks: ['(List A) -> Bool'], z3Only: true, doc: 'Tests whether a list (Z3\'s predefined `List`) is empty.' },
    { name: 'is-insert', theory: 'Z3 Datatypes', ranks: ['(List A) -> Bool'], z3Only: true, doc: 'Tests whether a list (Z3\'s predefined `List`) is non-empty.' },
];
