export const buildinDwyerPatterns = `
module DwyerPatterns

// This file is a merge between the legacy DwyerPatterns file that 
// contained inconsistent names of patterns and parameters and the 
// current DwyerPatterns as used in many newer examples.

// We merged this file for backwards compatibility with older 
// specifications. Do not use it anywhere else. 
// The old names must disappear!

/////////////////////
// CURRENT PATTERN NAMES
/////////////////////


/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> G !p
 * </p>
 * 
 * a better way is to use a normal guarantee/assumption
 */
pattern P_is_false_globally(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  alwEv (state=S0);
}

/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> (!p U r) || !F r
 * </p>
 */
pattern P_is_false_before_R(p, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> After q<br>
 * <b>LTL:</b> G (!q || G !p)
 * </p>
 */
pattern P_is_false_after_Q(p, q) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}

/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G ((!p U r) || !(q && !r && F r))
 * </p>
 */
pattern P_is_false_between_Q_and_R(p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & q) & next(state=S1)) |
  (state=S0 & (!r & p & q) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || (r V (!p || r)))
 * </p>
 */
pattern P_is_false_after_Q_until_R(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r) & next(state=S1)) |
  (state=S0 & (q & p & !r) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!p & !r) & next(state=S1)) |
  (state=S1 & (p & !r) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> F p
 * </p>
 */
pattern P_becomes_true_globally(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  alwEv (state=S1);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> (p && !r) V (!r || (p && !r))
 * </p>
 */
pattern P_becomes_true_before_R(p, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> After q<br>
 * <b>LTL:</b> G !q || F (q && F p)
 * </p>
 */
pattern P_becomes_true_After_Q(q, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G (!(q && !r) || ((p && !r) V (!r || (p && !r))))
 * </p>
 */
pattern P_becomes_true_between_Q_and_R(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !p) | (q & r) | (!r & p) | (!q & r & p)) & next(state=S0)) |
  (state=S0 & (q & !r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (r) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || (!r U (p && !r)))
 * </p>
 */
pattern P_becomes_true_after_Q_until_R(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !p) | (q & r) | (!r & p) | (!q & r & p)) & next(state=S0)) |
  (state=S0 & (q & !r & !p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & p) & next(state=S0)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & !p) & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0);
}

/**
 * <p>
 * <b>Kind:</b> Bounded Existence: p-states occur at most 2 times<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> (((G !p V (p || G !p)) V (!p || (G !p V (p || G !p)))) V (p || ((G !p V (p || G !p)) V (!p || (G !p V (p || G !p)))))) V (!p || (((G !p V (p || G !p)) V (!p || (G ! p V (p || G !p)))) V (p || ((G !p V (p || G !p)) V (!p || (G !p V (p || G !p))))
)))
 * </p>
 */
pattern P_occures_at_most_twice_globally(p) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S1)) |
  (state=S1 & (!p) & next(state=S2)) |
  (state=S2 & (!p) & next(state=S2)) |
  (state=S2 & (p) & next(state=S3)) |
  (state=S3 & (p) & next(state=S3)) |
  (state=S3 & (!p) & next(state=S4)) |
  (state=S4 & (!p) & next(state=S4)) |
  (state=S4 & (p) & next(state=S5)) |
  (state=S5 & TRUE & next(state=S5)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3 | state=S4);
}

/**
 * <p>
 * <b>Kind:</b> Bounded Existence: p-states occur at most 2 times<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> ((!p && !r) U (r || ((p && !r) U (r || ((!p && !r) U (r || ((p && !r) U (r || (!p U r))))))))) || !F r
 * </p>
 */
pattern P_occures_at_most_twice_before_R(p, r) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & p) & next(state=S2)) |
  (state=S2 & (!r & !p) & next(state=S3)) |
  (state=S3 & (r) & next(state=S1)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p) & next(state=S4)) |
  (state=S4 & (r) & next(state=S1)) |
  (state=S4 & (!r & p) & next(state=S4)) |
  (state=S4 & (!r & !p) & next(state=S5)) |
  (state=S5 & (r) & next(state=S1)) |
  (state=S5 & (!r & !p) & next(state=S5)) |
  (state=S5 & (!r & p) & next(state=S6)) |
  (state=S6 & (!r) & next(state=S6)) |
  (state=S6 & (r) & next(state=S7)) |
  (state=S7 & TRUE & next(state=S7)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3 | state=S4 | state=S5 | state=S6);
}

/**
 * <p>
 * <b>Kind:</b> Bounded Existence: p-states occur at most 2 times<br>
 * <b>Scope:</b> After q<br>
 * <b>LTL:</b> 
(!q U (q && ((((G !p V (p || G !p)) V (!p || (G !p V (p || G !p)))) V (p || ((G !p V (p || G !p)) V (!p || (G !p V (p || G !p)))))) V (!p || (((G !p V (p || G !p))
V (!p || (G !p V (p || G !p)))) V (p || ((G !p V (p || G !p)) V (!p || (G !p V ( p || G !p)))))))))) || !F q
 * </p>
 */
pattern P_occures_at_most_twice_after_Q(p, q) {
  var { S0, S1, S2, S3, S4, S5, S6} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & (p) & next(state=S2)) |
  (state=S2 & (!p) & next(state=S3)) |
  (state=S3 & (!p) & next(state=S3)) |
  (state=S3 & (p) & next(state=S4)) |
  (state=S4 & (p) & next(state=S4)) |
  (state=S4 & (!p) & next(state=S5)) |
  (state=S5 & (!p) & next(state=S5)) |
  (state=S5 & (p) & next(state=S6)) |
  (state=S6 & TRUE & next(state=S6)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3 | state=S4 | state=S5);
}

/**
 * <p>
 * <b>Kind:</b> Bounded Existence: p-states occur at most 2 times<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G (((!p && !r) U (r || ((p && !r) U (r || ((!p && !r) U (r || ((p && !r) U (r || (!p U r))))))))) || !(q && F r))
 * </p>
 */
pattern P_occures_at_most_twice_between_Q_and_R(p, q, r) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & q) & next(state=S5)) |
  (state=S0 & (!r & p & q) & next(state=S7)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p) & next(state=S6)) |
  (state=S4 & (r) & next(state=S2)) |
  (state=S4 & (!r) & next(state=S4)) |
  (state=S5 & (r) & next(state=S0)) |
  (state=S5 & (!r & !p) & next(state=S5)) |
  (state=S5 & (!r & p) & next(state=S7)) |
  (state=S6 & (r) & next(state=S0)) |
  (state=S6 & (!r & !p) & next(state=S1)) |
  (state=S6 & (!r & p) & next(state=S6)) |
  (state=S7 & (r) & next(state=S0)) |
  (state=S7 & (!r & !p) & next(state=S3)) |
  (state=S7 & (!r & p) & next(state=S7)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3 | state=S4 | state=S5 | state=S6 | state=S7);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> G p
 * </p>
 */
pattern P_is_true_globally(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (p) & next(state=S0)) |
  (state=S0 & (!p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  alwEv (state=S0);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> (p U r) || !F r
 * </p>
 */
pattern P_is_true_before_R(p, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & p) & next(state=S0)) |
  (state=S0 & (!r & !p) & next(state=S1)) |
  (state=S0 & (r) & next(state=S2)) |
  (state=S1 & (!r) & next(state=S1)) |
  (state=S1 & (r) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> After q<br>
 * <b>LTL:</b> G (!q || G p)
 * </p>
 */
pattern P_is_true_after_Q(p, q) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!p) & next(state=S1)) |
  (state=S2 & (p) & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G ((p U r) || !(q && !r && F r))
 * </p>
 */
pattern P_is_true_between_Q_and_R(p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & p & q) & next(state=S1)) |
  (state=S0 & (!r & !p & q) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & p) & next(state=S1)) |
  (state=S1 & (!r & !p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || (r V (p || r)))
 * </p>
 */
pattern P_is_true_After_Q_until_R(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r) & next(state=S1)) |
  (state=S0 & (q & p & !r) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!p & !r) & next(state=S1)) |
  (state=S2 & (p & !r) & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Precedence: s precedes p<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> s V (!p || s)
 * </p>
 */
pattern S_precedes_to_P_globally(s, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S0 & (s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Precedence: s precedes p<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> (!p U (r || s)) || !F r
 * </p>
 */
pattern S_precedes_to_P_before_R(s, p, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !s & !p) & next(state=S0)) |
  (state=S0 & ((r) | (!r & s)) & next(state=S1)) |
  (state=S0 & (!r & !s & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Precedence: s precedes p<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G ((!p U (r || s)) || !(q && !r && F r))
 * </p>
 */
pattern S_precedes_to_P_between_Q_and_R(s, p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q) | (!r & s & q)) & next(state=S0)) |
  (state=S0 & (!r & !s & !p & q) & next(state=S1)) |
  (state=S0 & (!r & !s & p & q) & next(state=S3)) |
  (state=S1 & ((r) | (!r & s)) & next(state=S0)) |
  (state=S1 & (!r & !s & !p) & next(state=S1)) |
  (state=S1 & (!r & !s & p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 * <p>
 * <b>Kind:</b> Precedence: s precedes p<br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || ((r || s) V (!p || r || s)))
 * </p>
 */
pattern S_precedes_to_P_after_Q_until_R(s, p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !r & !s) | (r) | (!r & s)) & next(state=S0)) |
  (state=S0 & (q & !p & !r & !s) & next(state=S1)) |
  (state=S0 & (q & p & !r & !s) & next(state=S2)) |
  (state=S1 & ((r) | (!r & s)) & next(state=S0)) |
  (state=S1 & (!p & !r & !s) & next(state=S1)) |
  (state=S1 & (p & !r & !s) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}


/**
 *<p>
 * <b>Kind:</b> Response: s responds to p <br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> G (!p || F s) (also G(p -> Fs))
 * </p>
 */
pattern S_responds_to_P_globally(s, p) {
  var { S0, S1} state;
  
  // initial assignments: initial state
  ini state=S0;
  
  // safety this and next state
  alw ((state=S0 & ((!p) | (p & s)) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S0)) |
  (state=S1 & (!s) & next(state=S1)));

  
  // equivalence of satisfaction
  alwEv (state=S0);
}

/**
 *<p>
 * <b>Kind:</b> Response: s responds to p <br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> ((!p || (!r U (!r && s))) U r) || !F r
 * </p>
 */
pattern S_responds_to_P_before_R(s, p, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!r & !p) | (!r & p & s)) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p & !s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & s) & next(state=S0)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 *<p>
 * <b>Kind:</b> Response: s responds to p <br>
 * <b>Scope:</b> After q<br>
 * <b>LTL:</b> G (!q || G (!p || F s))
 * </p>
 */
pattern S_responds_to_P_after_Q(s, p, q) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & ((q & !p) | (q & p & s)) & next(state=S1)) |
  (state=S0 & (q & p & !s) & next(state=S2)) |
  (state=S1 & ((!p) | (p & s)) & next(state=S1)) |
  (state=S1 & (p & !s) & next(state=S2)) |
  (state=S2 & (s) & next(state=S1)) |
  (state=S2 & (!s) & next(state=S2)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}

/**
 *<p>
 * <b>Kind:</b> Response: s responds to p <br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G (((!p || (!r U (!r && s))) U r) || !(q && !r && F r))
 * </p>
 */
pattern S_responds_to_P_between_Q_and_R(s, p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & ((!r & !p & q) | (!r & p & s & q)) & next(state=S2)) |
  (state=S0 & (!r & p & !s & q) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & ((!r & !p) | (!r & p & s)) & next(state=S2)) |
  (state=S2 & (!r & p & !s) & next(state=S3)) |
  (state=S3 & (r) & next(state=S1)) |
  (state=S3 & (!r & s) & next(state=S2)) |
  (state=S3 & (!r & !s) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response: s responds to p <br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || (r V (!p || r || (!r U (!r && s)))))
 * </p>
 */
pattern S_responds_to_P_after_Q_until_R(s, p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & ((q & !p & !r) | (q & p & !r & s)) & next(state=S1)) |
  (state=S0 & (q & p & !r & !s) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & ((!p & !r) | (p & !r & s)) & next(state=S1)) |
  (state=S1 & (p & !r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: s, t precedes p <br>
 * <b>Scope:</b> Globally <br>
 * <b>LTL:</b> (!p U (!p && s && X(!p U t))) || !F p
 * </p>
 */
pattern S_and_T_precedes_to_P_globally(s, t, p) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S0 & (!p & s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (p & !t) & next(state=S1)) |
  (state=S2 & (!p & !t) & next(state=S2)) |
  (state=S2 & (t) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: s, t precedes p <br>
 * <b>Scope:</b> Before r <br>
 * <b>LTL:</b> (!p U (r || (!p && s && X(!p U t)))) || !F r
 * </p>
 */
pattern S_and_T_precedes_to_P_before_R(s, t, p, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p & !s) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S0 & (!r & !p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S4)) |
  (state=S3 & ((r & !t) | (t)) & next(state=S1)) |
  (state=S3 & (!r & p & !t) & next(state=S2)) |
  (state=S3 & (!r & !p & !t) & next(state=S3)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: s, t precedes p <br>
 * <b>Scope:</b> After q <br>
 * <b>LTL:</b> G !q || (!q U ((!p U (!p && s && X(!p U t))) || !(q && F p)))
 * </p>
 */
pattern S_and_T_precedes_to_P_after_Q(s, t, p, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S1)) |
  (state=S0 & (!p & !s & q) & next(state=S2)) |
  (state=S0 & (p & q) & next(state=S3)) |
  (state=S0 & (!p & s & q) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (p) & next(state=S3)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (t) & next(state=S1)) |
  (state=S4 & (p & !t) & next(state=S3)) |
  (state=S4 & (!p & !t) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: s, t precedes p <br>
 * <b>Scope:</b> Between q and r <br>
 * <b>LTL:</b> G ((!p U (r || (!p && s && X(!p U t)))) || !(q && F r))
 * </p>
 */
pattern S_and_T_precedes_to_P_between_Q_and_R(s, t, p, q, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & !s & q) & next(state=S1)) |
  (state=S0 & (!r & p & q) & next(state=S3)) |
  (state=S0 & (!r & !p & s & q) & next(state=S4)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p & !s) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S3)) |
  (state=S1 & (!r & !p & s) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)) |
  (state=S4 & ((r & !t) | (t & !q) | (r & t & q)) & next(state=S0)) |
  (state=S4 & (!r & !p & !s & q) & next(state=S1)) |
  (state=S4 & ((!r & p & !t) | (!r & p & t & q)) & next(state=S3)) |
  (state=S4 & ((!r & !p & !t & !q) | (!r & !p & s & q)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: s, t precedes p <br>
 * <b>Scope:</b> After q until r <br>
 * <b>LTL:</b> G (!q || (!p U (r || (!p && s && X(!p U t)))) || !F p)
 * </p>
 */
pattern S_and_T_precedes_to_P_after_Q_until_R(s, t, p, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (q & r)) & next(state=S0)) |
  (state=S0 & (q & !r & !p & s) & next(state=S1)) |
  (state=S0 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S0 & (q & !r & p) & next(state=S3)) |
  (state=S1 & ((r & !t) | (!q & t) | (q & r & t)) & next(state=S0)) |
  (state=S1 & ((!q & !r & !p & !t) | (q & !r & !p & s)) & next(state=S1)) |
  (state=S1 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S1 & ((!r & p & !t) | (q & !r & p & t)) & next(state=S3)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!r & !p & s) & next(state=S1)) |
  (state=S2 & (!r & !p & !s) & next(state=S2)) |
  (state=S2 & (!r & p) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: p precedes (s, t) <br>
 * <b>Scope:</b> Globally <br>
 * <b>LTL:</b> (!s U p) || !F (s && XF t)
 * </p>
 */
pattern P_precedes_S_and_T_globally(p, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S0 & (!p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (t) & next(state=S2)) |
  (state=S3 & (!t) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: p precedes (s, t) <br>
 * <b>Scope:</b> Before r <br>
 * <b>LTL:</b> (!(!r && s && X(!r U (!r && t))) U (p || r)) || !F r
 * </p>
 */
pattern P_precedes_S_and_T_before_R(p, s, t, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p & !r & !s) & next(state=S0)) |
  (state=S0 & ((p) | (!p & r)) & next(state=S1)) |
  (state=S0 & (!p & !r & s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & !t) & next(state=S2)) |
  (state=S2 & (!r & t) & next(state=S3)) |
  (state=S3 & (!r) & next(state=S3)) |
  (state=S3 & (r) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: p precedes (s, t) <br>
 * <b>Scope:</b> After q <br>
 * <b>LTL:</b> G !q || (!q U (q && ((!s U p) || !F (s && XF t))))
 * </p>
 */
pattern P_precedes_S_and_T_after_q(p, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & p) & next(state=S1)) |
  (state=S0 & (q & !p & !s) & next(state=S2)) |
  (state=S0 & (q & !p & s) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (p) & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (t) & next(state=S3)) |
  (state=S4 & (!t) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: p precedes (s, t) <br>
 * <b>Scope:</b> Between q and r <br>
 * <b>LTL:</b> G ((!(!r && s && X(!r U (!r && t))) U (p || r)) || !(q && F r))
 * </p>
 */
pattern P_precedes_S_and_T_between_q_and_R(p, s, t, q, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (p & q) | (!p & r & q)) & next(state=S0)) |
  (state=S0 & (!p & !r & !s & q) & next(state=S2)) |
  (state=S0 & (!p & !r & s & q) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & ((p) | (!p & r)) & next(state=S0)) |
  (state=S2 & (!p & !r & !s) & next(state=S2)) |
  (state=S2 & (!p & !r & s) & next(state=S3)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & (!r & !t) & next(state=S3)) |
  (state=S3 & (!r & t) & next(state=S4)) |
  (state=S4 & (r) & next(state=S1)) |
  (state=S4 & (!r) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2 | state=S3 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Precedence Chain: p precedes (s, t) <br>
 * <b>Scope:</b> After q until r <br>
 * <b>LTL:</b> G (!q || (!(!r && s && X(!r U (!r && t))) U (p || r)) || G !(s && XF t))
 * </p>
 */
pattern P_precedes_S_and_T_after_q_until_R(p, s, t, q, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q & !r) | (q & p) | (!p & r) | (!q & p & r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r & s) & next(state=S1)) |
  (state=S0 & (q & !p & !r & !s) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !t) & next(state=S1)) |
  (state=S1 & (!r & t) & next(state=S3)) |
  (state=S2 & ((p) | (!p & r)) & next(state=S0)) |
  (state=S2 & (!p & !r & s) & next(state=S1)) |
  (state=S2 & (!p & !r & !s) & next(state=S2)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: p responds to s,t <br>
 * <b>Scope:</b> Globally <br>
 * <b>LTL:</b> G (XF (t && F p) || !(s && XF t))
 * </p>
 */
pattern P_responds_to_S_and_T_globally(p, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!s) & next(state=S0)) |
  (state=S0 & (s) & next(state=S2)) |
  (state=S1 & (p & !s) & next(state=S0)) |
  (state=S1 & (!p & !s) & next(state=S1)) |
  (state=S1 & (p & s) & next(state=S2)) |
  (state=S1 & (!p & s) & next(state=S3)) |
  (state=S2 & (t & p & !s) & next(state=S0)) |
  (state=S2 & (t & !p & !s) & next(state=S1)) |
  (state=S2 & ((!t) | (t & p & s)) & next(state=S2)) |
  (state=S2 & (t & !p & s) & next(state=S3)) |
  (state=S3 & (t & p & !s) & next(state=S0)) |
  (state=S3 & (t & !p & !s) & next(state=S1)) |
  (state=S3 & ((!t & p) | (t & p & s)) & next(state=S2)) |
  (state=S3 & ((!t & !p) | (t & !p & s)) & next(state=S3)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S2);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: p responds to s,t <br>
 * <b>Scope:</b> Before r <br>
 * <b>LTL:</b> ((X(!r U (t && F p)) || !(s && X(!r U t))) U r) || !F r
 * </p>
 */
pattern P_responds_to_S_and_T_before_r(p, s, t, r) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !s) & next(state=S0)) |
  (state=S0 & (r) & next(state=S2)) |
  (state=S0 & (!r & s) & next(state=S3)) |
  (state=S1 & (!r & t & p & !s) & next(state=S0)) |
  (state=S1 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S1)) |
  (state=S1 & (r & p) & next(state=S2)) |
  (state=S1 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S3)) |
  (state=S1 & (!r & t & !p & !s) & next(state=S4)) |
  (state=S1 & (r & !p) & next(state=S5)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (!r & t & p & !s) & next(state=S0)) |
  (state=S3 & (!r & t & !p & s) & next(state=S1)) |
  (state=S3 & ((r & !t) | (r & t & p)) & next(state=S2)) |
  (state=S3 & ((!r & !t) | (!r & t & p & s)) & next(state=S3)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S4)) |
  (state=S3 & (r & t & !p) & next(state=S5)) |
  (state=S4 & (!r & p & !s) & next(state=S0)) |
  (state=S4 & (!r & !p & s) & next(state=S1)) |
  (state=S4 & (r & p) & next(state=S2)) |
  (state=S4 & (!r & p & s) & next(state=S3)) |
  (state=S4 & (!r & !p & !s) & next(state=S4)) |
  (state=S4 & (r & !p) & next(state=S5)) |
  (state=S5 & (p) & next(state=S2)) |
  (state=S5 & (!p) & next(state=S5)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: p responds to s,t <br>
 * <b>Scope:</b> After q <br>
 * <b>LTL:</b> G (!q || G (X(!t U (t && F p)) || !(s && XF t)))
 * </p>
 */
pattern P_responds_to_S_and_T_after_Q(p, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !s) & next(state=S1)) |
  (state=S0 & (q & s) & next(state=S3)) |
  (state=S1 & (!s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S3)) |
  (state=S2 & (p & !s) & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (p & s) & next(state=S3)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & (t & p & !s) & next(state=S1)) |
  (state=S3 & (t & !p & !s) & next(state=S2)) |
  (state=S3 & ((!t) | (t & p & s)) & next(state=S3)) |
  (state=S3 & (t & !p & s) & next(state=S4)) |
  (state=S4 & (t & p & !s) & next(state=S1)) |
  (state=S4 & (t & !p & !s) & next(state=S2)) |
  (state=S4 & ((!t & p) | (t & p & s)) & next(state=S3)) |
  (state=S4 & ((!t & !p) | (t & !p & s)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: p responds to s,t <br>
 * <b>Scope:</b> Between q and r <br>
 * <b>LTL:</b> G (((X(!r U (t && F p)) || !(s && X(!r U t))) U r) || !(q && F r))
 * </p>
 */
pattern P_responds_to_S_and_T_between_Q_and_R(p, s, t, q, r) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !s & q) & next(state=S2)) |
  (state=S0 & (!r & s & q) & next(state=S4)) |
  (state=S1 & (r & p) & next(state=S0)) |
  (state=S1 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S1)) |
  (state=S1 & (!r & t & p & !s) & next(state=S2)) |
  (state=S1 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S4)) |
  (state=S1 & (!r & t & !p & !s) & next(state=S5)) |
  (state=S1 & (r & !p) & next(state=S7)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S4)) |
  (state=S3 & (r & p) & next(state=S0)) |
  (state=S3 & (!r & t & p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S3)) |
  (state=S3 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S4)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S6)) |
  (state=S3 & (r & !p) & next(state=S7)) |
  (state=S4 & ((r & !t) | (r & t & p)) & next(state=S0)) |
  (state=S4 & (!r & t & !p & s) & next(state=S1)) |
  (state=S4 & (!r & t & p & !s) & next(state=S2)) |
  (state=S4 & ((!r & !t) | (!r & t & p & s)) & next(state=S4)) |
  (state=S4 & (!r & t & !p & !s) & next(state=S5)) |
  (state=S4 & (r & t & !p) & next(state=S7)) |
  (state=S5 & (r & p) & next(state=S0)) |
  (state=S5 & (!r & !p & s) & next(state=S1)) |
  (state=S5 & (!r & p & !s) & next(state=S2)) |
  (state=S5 & (!r & p & s) & next(state=S4)) |
  (state=S5 & (!r & !p & !s) & next(state=S5)) |
  (state=S5 & (r & !p) & next(state=S7)) |
  (state=S6 & (r & p) & next(state=S0)) |
  (state=S6 & (!r & p & !s) & next(state=S2)) |
  (state=S6 & (!r & !p & s) & next(state=S3)) |
  (state=S6 & (!r & p & s) & next(state=S4)) |
  (state=S6 & (!r & !p & !s) & next(state=S6)) |
  (state=S6 & (r & !p) & next(state=S7)) |
  (state=S7 & ((p & !q) | (r & p & q)) & next(state=S0)) |
  (state=S7 & (!r & p & !s & q) & next(state=S2)) |
  (state=S7 & (!r & !p & s & q) & next(state=S3)) |
  (state=S7 & (!r & p & s & q) & next(state=S4)) |
  (state=S7 & (!r & !p & !s & q) & next(state=S6)) |
  (state=S7 & ((!p & !q) | (r & !p & q)) & next(state=S7)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S4 | state=S5);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: p responds to s,t <br>
 * <b>Scope:</b> After q until r <br>
 * <b>LTL:</b> G (!q || ((X(!r U (t && F p)) || !(s && X(!r U t))) U (r || G (X(!r U (t && F p)) || !(s && X(!r U t))))))
 * </p>
 */
pattern P_responds_to_S_and_T_after_Q_until_R(p, s, t, q, r) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (q & r)) & next(state=S0)) |
  (state=S0 & (q & !r & !s) & next(state=S1)) |
  (state=S0 & (q & !r & s) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !s) & next(state=S1)) |
  (state=S1 & (!r & s) & next(state=S3)) |
  (state=S2 & (r & p) & next(state=S0)) |
  (state=S2 & (!r & p & !s) & next(state=S1)) |
  (state=S2 & (!r & !p & !s) & next(state=S2)) |
  (state=S2 & (!r & p & s) & next(state=S3)) |
  (state=S2 & (r & !p) & next(state=S4)) |
  (state=S2 & (!r & !p & s) & next(state=S5)) |
  (state=S3 & ((r & !t) | (r & t & p)) & next(state=S0)) |
  (state=S3 & (!r & t & p & !s) & next(state=S1)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !t) | (!r & t & p & s)) & next(state=S3)) |
  (state=S3 & (r & t & !p) & next(state=S4)) |
  (state=S3 & (!r & t & !p & s) & next(state=S5)) |
  (state=S4 & ((!q & p) | (q & r & p)) & next(state=S0)) |
  (state=S4 & (q & !r & p & !s) & next(state=S1)) |
  (state=S4 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S4 & (q & !r & p & s) & next(state=S3)) |
  (state=S4 & ((!q & !p) | (q & r & !p)) & next(state=S4)) |
  (state=S4 & (q & !r & !p & s) & next(state=S5)) |
  (state=S5 & (r & p) & next(state=S0)) |
  (state=S5 & (!r & t & p & !s) & next(state=S1)) |
  (state=S5 & (!r & t & !p & !s) & next(state=S2)) |
  (state=S5 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S3)) |
  (state=S5 & (r & !p) & next(state=S4)) |
  (state=S5 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S5)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: s,t responds to p <br>
 * <b>Scope:</b> Globally <br>
 * <b>LTL:</b> G (!p || F (s && XF t))
 * </p>
 */
pattern S_and_T_responds_to_P_globally(s, t, p) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S0 & (p & s) & next(state=S4)) |
  (state=S1 & (!s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S3)) |
  (state=S2 & (!s & t) & next(state=S1)) |
  (state=S2 & (!s & !t) & next(state=S2)) |
  (state=S2 & (s & t) & next(state=S3)) |
  (state=S2 & (s & !t) & next(state=S4)) |
  (state=S3 & (!p & t) & next(state=S0)) |
  (state=S3 & (p & !s & t) & next(state=S1)) |
  (state=S3 & (p & !s & !t) & next(state=S2)) |
  (state=S3 & (p & s & t) & next(state=S3)) |
  (state=S3 & ((!p & !t) | (p & s & !t)) & next(state=S4)) |
  (state=S4 & (!p & t) & next(state=S0)) |
  (state=S4 & (p & !s & t) & next(state=S1)) |
  (state=S4 & (p & !s & !t) & next(state=S2)) |
  (state=S4 & (p & s & t) & next(state=S3)) |
  (state=S4 & ((!p & !t) | (p & s & !t)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: s,t responds to p <br>
 * <b>Scope:</b> Before r <br>
 * <b>LTL:</b> ((!p || (!r U (!r && s && X(!r U t)))) U r) || !F r
 * </p>
 */
pattern S_and_T_responds_to_P_before_R(s, t, p, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p & !s) & next(state=S2)) |
  (state=S0 & (!r & p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S3)) |
  (state=S2 & (r) & next(state=S4)) |
  (state=S3 & (!r & !p & t) & next(state=S0)) |
  (state=S3 & (r & t) & next(state=S1)) |
  (state=S3 & (!r & p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !p & !t) | (!r & p & s)) & next(state=S3)) |
  (state=S3 & (r & !t) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: s,t responds to p <br>
 * <b>Scope:</b> After q <br>
 * <b>LTL:</b> G (!q || G (!p || (s && XF t)))
 * </p>
 */
pattern S_and_T_responds_to_P_after_q(s, t, p, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p & !s) & next(state=S2)) |
  (state=S0 & (q & p & s) & next(state=S3)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p & !s) & next(state=S2)) |
  (state=S1 & (p & s) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (!p & t) & next(state=S1)) |
  (state=S3 & (p & !s) & next(state=S2)) |
  (state=S3 & ((!p & !t) | (p & s)) & next(state=S4)) |
  (state=S4 & (!p & t) & next(state=S1)) |
  (state=S4 & (p & !s) & next(state=S2)) |
  (state=S4 & (p & s & t) & next(state=S3)) |
  (state=S4 & ((!p & !t) | (p & s & !t)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Response Chain: s,t responds to p <br>
 * <b>Scope:</b> Between q and r <br>
 * <b>LTL:</b> G (((!p || (!r U (!r && s && X(!r U t)))) U r) || !(q && F r))
 * </p>
 */
pattern S_and_T_responds_to_P_between_q_and_R(s, t, p, q, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & p & s & q) & next(state=S1)) |
  (state=S0 & (!r & p & !s & q) & next(state=S2)) |
  (state=S0 & (!r & !p & q) & next(state=S4)) |
  (state=S1 & (r & t) & next(state=S0)) |
  (state=S1 & ((!r & !p & !t) | (!r & p & s)) & next(state=S1)) |
  (state=S1 & (!r & p & !s) & next(state=S2)) |
  (state=S1 & (r & !t) & next(state=S3)) |
  (state=S1 & (!r & !p & t) & next(state=S4)) |
  (state=S2 & (!r & s) & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (r) & next(state=S0)) |
  (state=S4 & (!r & p & s) & next(state=S1)) |
  (state=S4 & (!r & p & !s) & next(state=S2)) |
  (state=S4 & (!r & !p) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S2 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Constrained Chain: s,t without z responds to p <br>
 * <b>Scope:</b> Globally <br>
 * <b>LTL:</b> G (!p || F (s && !z && X(!z U t)))
 * </p>
 */
pattern S_and_T_without_Z_responds_to_P_globally(s, t, z, p) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & ((p & !s) | (p & s & z)) & next(state=S2)) |
  (state=S0 & (p & s & !z) & next(state=S3)) |
  (state=S1 & (!p & t) & next(state=S0)) |
  (state=S1 & ((p & !s & t) | (p & s & z & t)) & next(state=S2)) |
  (state=S1 & ((!p & !z & !t) | (p & s & !z)) & next(state=S3)) |
  (state=S1 & ((p & !s & !t) | (!p & z & !t) | (p & s & z & !t)) & next(state=S4)) |
  (state=S2 & (s & !z & t) & next(state=S1)) |
  (state=S2 & (!s & !z & !t) & next(state=S2)) |
  (state=S2 & (s & !z & !t) & next(state=S3)) |
  (state=S2 & (z & !t) & next(state=S4)) |
  (state=S2 & ((!s & t) | (s & z & t)) & next(state=S5)) |
  (state=S3 & (!p & t) & next(state=S0)) |
  (state=S3 & (p & s & !z & t) & next(state=S1)) |
  (state=S3 & (p & !s & !z & !t) & next(state=S2)) |
  (state=S3 & ((!p & !z & !t) | (p & s & !z & !t)) & next(state=S3)) |
  (state=S3 & (z & !t) & next(state=S4)) |
  (state=S3 & ((p & !s & t) | (p & s & z & t)) & next(state=S5)) |
  (state=S4 & (s & !z) & next(state=S3)) |
  (state=S4 & ((!s) | (s & z)) & next(state=S4)) |
  (state=S5 & (s & !z) & next(state=S3)) |
  (state=S5 & ((!s) | (s & z)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S5);
}

/**
 *<p>
 * <b>Kind:</b> Constrained Chain: s,t without z responds to p <br>
 * <b>Scope:</b> Before r <br>
 * <b>LTL:</b> ((!p || (!r U (!r && s && !z && X((!r && !z) U t)))) U r) || !F r
 * </p>
 */
pattern S_and_T_without_Z_responds_to_P_before_R(s, t, z, p, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & ((!r & p & !s) | (!r & p & s & z)) & next(state=S3)) |
  (state=S0 & (!r & p & s & !z) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & ((!r & !s) | (!r & s & z)) & next(state=S3)) |
  (state=S3 & (!r & s & !z) & next(state=S4)) |
  (state=S4 & (!r & !p & t) & next(state=S0)) |
  (state=S4 & (r & t) & next(state=S1)) |
  (state=S4 & (r & !t) & next(state=S2)) |
  (state=S4 & ((!r & p & !s) | (!r & !p & z & !t) | (!r & p & s & z)) & next(state=S3)) |
  (state=S4 & ((!r & !p & !z & !t) | (!r & p & s & !z)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3 | state=S4);
}

/**
 *<p>
 * <b>Kind:</b> Constrained Chain: s,t without z responds to p <br>
 * <b>Scope:</b> After q <br>
 * <b>LTL:</b> G (!q || G (!p || (s && !z && X(!z U t))))
 * </p>
 */
pattern S_and_T_without_Z_responds_to_P_after_Q(s, t, z, p, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p & s & !z) & next(state=S2)) |
  (state=S0 & ((q & p & !s) | (q & p & s & z)) & next(state=S4)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p & s & !z) & next(state=S2)) |
  (state=S1 & ((p & !s) | (p & s & z)) & next(state=S4)) |
  (state=S2 & (!p & t) & next(state=S1)) |
  (state=S2 & ((!p & !z & !t) | (p & s & !z & !t)) & next(state=S2)) |
  (state=S2 & (p & s & !z & t) & next(state=S3)) |
  (state=S2 & ((p & !s) | (!p & z & !t) | (p & s & z)) & next(state=S4)) |
  (state=S3 & (!p & t) & next(state=S1)) |
  (state=S3 & ((!p & !z & !t) | (p & s & !z)) & next(state=S2)) |
  (state=S3 & ((p & !s) | (!p & z & !t) | (p & s & z)) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3);
}

/**
 *<p>
 * <b>Kind:</b> Constrained Chain: s,t without z responds to p <br>
 * <b>Scope:</b> Between q and r <br>
 * <b>LTL:</b> G (((!p || (!r U (!r && s && !z && X((!r && !z) U t)))) U r) || !(q && F r))
 * </p>
 */
pattern S_and_T_without_Z_responds_to_P_between_Q_and_R(s, t, z, p, q, r) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  alw ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & ((!r & p & !s & q) | (!r & p & s & z & q)) & next(state=S1)) |
  (state=S0 & (!r & !p & q) & next(state=S3)) |
  (state=S0 & (!r & p & s & !z & q) & next(state=S4)) |
  (state=S1 & ((!r & !s) | (!r & s & z)) & next(state=S1)) |
  (state=S1 & (r) & next(state=S2)) |
  (state=S1 & (!r & s & !z) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & ((!r & p & !s) | (!r & p & s & z)) & next(state=S1)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p & s & !z) & next(state=S4)) |
  (state=S4 & (r & t) & next(state=S0)) |
  (state=S4 & ((!r & p & !s) | (!r & !p & z & !t) | (!r & p & s & z)) & next(state=S1)) |
  (state=S4 & (r & !t) & next(state=S2)) |
  (state=S4 & (!r & !p & t) & next(state=S3)) |
  (state=S4 & ((!r & !p & !z & !t) | (!r & p & s & !z)) & next(state=S4)));

  -- equivalence of satisfaction
  alwEv (state=S0 | state=S1 | state=S3 | state=S4);
}

/////////////////////
// OLD PATTERN NAMES
/////////////////////


/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> G !p
 * </p>
 * 
 * a better way is to use a normal guarantee/assumption
 */
pattern notP_globally(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  GF (state=S0);
}

/**
 * <p>
 * <b>Kind:</b> Absence: p is false<br>
 * <b>Scope:</b> Before r<br>
 * <b>LTL:</b> (!p U r) || !F r
 * </p>
 */
pattern notP_beforeR(p, r) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern03(q, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}

pattern pattern04(r, p, q) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & q) & next(state=S1)) |
  (state=S0 & (!r & p & q) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern05(q, p, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r) & next(state=S1)) |
  (state=S0 & (q & p & !r) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!p & !r) & next(state=S1)) |
  (state=S1 & (p & !r) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}

pattern pattern06(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  GF (state=S1);
}

pattern pattern07(r, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

pattern pattern08(q, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

/**
 * <p>
 * <b>Kind:</b> Existence: p becomes true<br>
 * <b>Scope:</b> Between q and r<br>
 * <b>LTL:</b> G (!(q && !r) || ((p && !r) V (!r || (p && !r))))
 * </p>
 */
pattern pBecomesTrue_betweenQandR(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !p) | (q & r) | (!r & p) | (!q & r & p)) & next(state=S0)) |
  (state=S0 & (q & !r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (r) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}

pattern pattern10(q, r, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !p) | (q & r) | (!r & p) | (!q & r & p)) & next(state=S0)) |
  (state=S0 & (q & !r & !p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & p) & next(state=S0)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & !p) & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0);
}

pattern pattern11(p) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S1)) |
  (state=S1 & (!p) & next(state=S2)) |
  (state=S2 & (!p) & next(state=S2)) |
  (state=S2 & (p) & next(state=S3)) |
  (state=S3 & (p) & next(state=S3)) |
  (state=S3 & (!p) & next(state=S4)) |
  (state=S4 & (!p) & next(state=S4)) |
  (state=S4 & (p) & next(state=S5)) |
  (state=S5 & TRUE & next(state=S5)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3 | state=S4);
}

pattern pattern12(r, p) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & p) & next(state=S2)) |
  (state=S2 & (!r & !p) & next(state=S3)) |
  (state=S3 & (r) & next(state=S1)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p) & next(state=S4)) |
  (state=S4 & (r) & next(state=S1)) |
  (state=S4 & (!r & p) & next(state=S4)) |
  (state=S4 & (!r & !p) & next(state=S5)) |
  (state=S5 & (r) & next(state=S1)) |
  (state=S5 & (!r & !p) & next(state=S5)) |
  (state=S5 & (!r & p) & next(state=S6)) |
  (state=S6 & (!r) & next(state=S6)) |
  (state=S6 & (r) & next(state=S7)) |
  (state=S7 & TRUE & next(state=S7)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3 | state=S4 | state=S5 | state=S6);
}

pattern pattern13(q, p) {
  var { S0, S1, S2, S3, S4, S5, S6} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p) & next(state=S2)) |
  (state=S2 & (p) & next(state=S2)) |
  (state=S2 & (!p) & next(state=S3)) |
  (state=S3 & (!p) & next(state=S3)) |
  (state=S3 & (p) & next(state=S4)) |
  (state=S4 & (p) & next(state=S4)) |
  (state=S4 & (!p) & next(state=S5)) |
  (state=S5 & (!p) & next(state=S5)) |
  (state=S5 & (p) & next(state=S6)) |
  (state=S6 & TRUE & next(state=S6)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3 | state=S4 | state=S5);
}

pattern pattern14(r, p, q) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & q) & next(state=S5)) |
  (state=S0 & (!r & p & q) & next(state=S7)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p) & next(state=S6)) |
  (state=S4 & (r) & next(state=S2)) |
  (state=S4 & (!r) & next(state=S4)) |
  (state=S5 & (r) & next(state=S0)) |
  (state=S5 & (!r & !p) & next(state=S5)) |
  (state=S5 & (!r & p) & next(state=S7)) |
  (state=S6 & (r) & next(state=S0)) |
  (state=S6 & (!r & !p) & next(state=S1)) |
  (state=S6 & (!r & p) & next(state=S6)) |
  (state=S7 & (r) & next(state=S0)) |
  (state=S7 & (!r & !p) & next(state=S3)) |
  (state=S7 & (!r & p) & next(state=S7)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3 | state=S4 | state=S5 | state=S6 | state=S7);
}

pattern pattern16(p) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (p) & next(state=S0)) |
  (state=S0 & (!p) & next(state=S1)) |
  (state=S1 & TRUE & next(state=S1)));

  -- equivalence of satisfaction
  GF (state=S0);
}

pattern pattern17(r, p) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & p) & next(state=S0)) |
  (state=S0 & (!r & !p) & next(state=S1)) |
  (state=S0 & (r) & next(state=S2)) |
  (state=S1 & (!r) & next(state=S1)) |
  (state=S1 & (r) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern18(q, p) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!p) & next(state=S1)) |
  (state=S2 & (p) & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

pattern pattern19(r, p, q) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & p & q) & next(state=S1)) |
  (state=S0 & (!r & !p & q) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & p) & next(state=S1)) |
  (state=S1 & (!r & !p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

/**
 * <p>
 * <b>Kind:</b> Universality: p is true<br>
 * <b>Scope:</b> After q until r<br>
 * <b>LTL:</b> G (!(q && !r) || (r V (p || r)))
 * </p>
 */
pattern pHolds_afterQuntilR(p, q, r) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r) & next(state=S1)) |
  (state=S0 & (q & p & !r) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!p & !r) & next(state=S1)) |
  (state=S2 & (p & !r) & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

pattern pattern21(p, s) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S0 & (s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

pattern pattern22(r, s, p) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !s & !p) & next(state=S0)) |
  (state=S0 & ((r) | (!r & s)) & next(state=S1)) |
  (state=S0 & (!r & !s & p) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern24(r, s, p, q) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q) | (!r & s & q)) & next(state=S0)) |
  (state=S0 & (!r & !s & !p & q) & next(state=S1)) |
  (state=S0 & (!r & !s & p & q) & next(state=S3)) |
  (state=S1 & ((r) | (!r & s)) & next(state=S0)) |
  (state=S1 & (!r & !s & !p) & next(state=S1)) |
  (state=S1 & (!r & !s & p) & next(state=S3)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern25(q, p, r, s) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !r & !s) | (r) | (!r & s)) & next(state=S0)) |
  (state=S0 & (q & !p & !r & !s) & next(state=S1)) |
  (state=S0 & (q & p & !r & !s) & next(state=S2)) |
  (state=S1 & ((r) | (!r & s)) & next(state=S0)) |
  (state=S1 & (!p & !r & !s) & next(state=S1)) |
  (state=S1 & (p & !r & !s) & next(state=S2)) |
  (state=S2 & TRUE & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}


/**
 *<p> 
 * <b>Kind:</b> Response: s responds to p<br>
 * <b>Scope:</b> Globally<br>
 * <b>LTL:</b> G (p -> F s)
 * </p>
 * @param p triggers the response
 * @param s (is the response)
 */
pattern pRespondsToS(p, s) {
  var { S0, S1} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!p) | (p & s)) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S0)) |
  (state=S1 & (!s) & next(state=S1)));

  -- equivalence of satisfaction
  GF (state=S0);
}

pattern pattern27(r, p, s) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!r & !p) | (!r & p & s)) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p & !s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & s) & next(state=S0)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern28(q, p, s) {
  var { S0, S1, S2} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & ((q & !p) | (q & p & s)) & next(state=S1)) |
  (state=S0 & (q & p & !s) & next(state=S2)) |
  (state=S1 & ((!p) | (p & s)) & next(state=S1)) |
  (state=S1 & (p & !s) & next(state=S2)) |
  (state=S2 & (s) & next(state=S1)) |
  (state=S2 & (!s) & next(state=S2)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}

pattern pattern29(r, p, s, q) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & ((!r & !p & q) | (!r & p & s & q)) & next(state=S2)) |
  (state=S0 & (!r & p & !s & q) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & ((!r & !p) | (!r & p & s)) & next(state=S2)) |
  (state=S2 & (!r & p & !s) & next(state=S3)) |
  (state=S3 & (r) & next(state=S1)) |
  (state=S3 & (!r & s) & next(state=S2)) |
  (state=S3 & (!r & !s) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2 | state=S3);
}

pattern pattern30(q, p, r, s) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !r) | (r)) & next(state=S0)) |
  (state=S0 & ((q & !p & !r) | (q & p & !r & s)) & next(state=S1)) |
  (state=S0 & (q & p & !r & !s) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & ((!p & !r) | (p & !r & s)) & next(state=S1)) |
  (state=S1 & (p & !r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1);
}

pattern pattern31(p, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S0 & (!p & s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (p & !t) & next(state=S1)) |
  (state=S2 & (!p & !t) & next(state=S2)) |
  (state=S2 & (t) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2 | state=S3);
}

pattern pattern32(r, p, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p & !s) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p) & next(state=S2)) |
  (state=S0 & (!r & !p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r) & next(state=S2)) |
  (state=S2 & (r) & next(state=S4)) |
  (state=S3 & ((r & !t) | (t)) & next(state=S1)) |
  (state=S3 & (!r & p & !t) & next(state=S2)) |
  (state=S3 & (!r & !p & !t) & next(state=S3)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3);
}

pattern pattern33(p, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S1)) |
  (state=S0 & (!p & !s & q) & next(state=S2)) |
  (state=S0 & (p & q) & next(state=S3)) |
  (state=S0 & (!p & s & q) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (p) & next(state=S3)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (t) & next(state=S1)) |
  (state=S4 & (p & !t) & next(state=S3)) |
  (state=S4 & (!p & !t) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S4);
}

pattern pattern34(r, p, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !p & !s & q) & next(state=S1)) |
  (state=S0 & (!r & p & q) & next(state=S3)) |
  (state=S0 & (!r & !p & s & q) & next(state=S4)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !p & !s) & next(state=S1)) |
  (state=S1 & (!r & p) & next(state=S3)) |
  (state=S1 & (!r & !p & s) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & (!r) & next(state=S3)) |
  (state=S4 & ((r & !t) | (t & !q) | (r & t & q)) & next(state=S0)) |
  (state=S4 & (!r & !p & !s & q) & next(state=S1)) |
  (state=S4 & ((!r & p & !t) | (!r & p & t & q)) & next(state=S3)) |
  (state=S4 & ((!r & !p & !t & !q) | (!r & !p & s & q)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3 | state=S4);
}

pattern pattern35(q, r, p, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (q & r)) & next(state=S0)) |
  (state=S0 & (q & !r & !p & s) & next(state=S1)) |
  (state=S0 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S0 & (q & !r & p) & next(state=S3)) |
  (state=S1 & ((r & !t) | (!q & t) | (q & r & t)) & next(state=S0)) |
  (state=S1 & ((!q & !r & !p & !t) | (q & !r & !p & s)) & next(state=S1)) |
  (state=S1 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S1 & ((!r & p & !t) | (q & !r & p & t)) & next(state=S3)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!r & !p & s) & next(state=S1)) |
  (state=S2 & (!r & !p & !s) & next(state=S2)) |
  (state=S2 & (!r & p) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern36(p, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p & !s) & next(state=S0)) |
  (state=S0 & (p) & next(state=S1)) |
  (state=S0 & (!p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (t) & next(state=S2)) |
  (state=S3 & (!t) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern37(p, r, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p & !r & !s) & next(state=S0)) |
  (state=S0 & ((p) | (!p & r)) & next(state=S1)) |
  (state=S0 & (!p & !r & s) & next(state=S2)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (r) & next(state=S1)) |
  (state=S2 & (!r & !t) & next(state=S2)) |
  (state=S2 & (!r & t) & next(state=S3)) |
  (state=S3 & (!r) & next(state=S3)) |
  (state=S3 & (r) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3);
}

pattern pattern38(q, p, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & p) & next(state=S1)) |
  (state=S0 & (q & !p & !s) & next(state=S2)) |
  (state=S0 & (q & !p & s) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (p) & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (t) & next(state=S3)) |
  (state=S4 & (!t) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S4);
}

pattern pattern39(p, r, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (p & q) | (!p & r & q)) & next(state=S0)) |
  (state=S0 & (!p & !r & !s & q) & next(state=S2)) |
  (state=S0 & (!p & !r & s & q) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & ((p) | (!p & r)) & next(state=S0)) |
  (state=S2 & (!p & !r & !s) & next(state=S2)) |
  (state=S2 & (!p & !r & s) & next(state=S3)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & (!r & !t) & next(state=S3)) |
  (state=S3 & (!r & t) & next(state=S4)) |
  (state=S4 & (r) & next(state=S1)) |
  (state=S4 & (!r) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2 | state=S3 | state=S4);
}

pattern pattern40(q, p, r, s, t) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q & !r) | (q & p) | (!p & r) | (!q & p & r)) & next(state=S0)) |
  (state=S0 & (q & !p & !r & s) & next(state=S1)) |
  (state=S0 & (q & !p & !r & !s) & next(state=S2)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !t) & next(state=S1)) |
  (state=S1 & (!r & t) & next(state=S3)) |
  (state=S2 & ((p) | (!p & r)) & next(state=S0)) |
  (state=S2 & (!p & !r & s) & next(state=S1)) |
  (state=S2 & (!p & !r & !s) & next(state=S2)) |
  (state=S3 & TRUE & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2);
}

pattern pattern41(t, p, s) {
  var { S0, S1, S2, S3} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!s) & next(state=S0)) |
  (state=S0 & (s) & next(state=S2)) |
  (state=S1 & (p & !s) & next(state=S0)) |
  (state=S1 & (!p & !s) & next(state=S1)) |
  (state=S1 & (p & s) & next(state=S2)) |
  (state=S1 & (!p & s) & next(state=S3)) |
  (state=S2 & (t & p & !s) & next(state=S0)) |
  (state=S2 & (t & !p & !s) & next(state=S1)) |
  (state=S2 & ((!t) | (t & p & s)) & next(state=S2)) |
  (state=S2 & (t & !p & s) & next(state=S3)) |
  (state=S3 & (t & p & !s) & next(state=S0)) |
  (state=S3 & (t & !p & !s) & next(state=S1)) |
  (state=S3 & ((!t & p) | (t & p & s)) & next(state=S2)) |
  (state=S3 & ((!t & !p) | (t & !p & s)) & next(state=S3)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S2);
}

pattern pattern42(r, t, p, s) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !s) & next(state=S0)) |
  (state=S0 & (r) & next(state=S2)) |
  (state=S0 & (!r & s) & next(state=S3)) |
  (state=S1 & (!r & t & p & !s) & next(state=S0)) |
  (state=S1 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S1)) |
  (state=S1 & (r & p) & next(state=S2)) |
  (state=S1 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S3)) |
  (state=S1 & (!r & t & !p & !s) & next(state=S4)) |
  (state=S1 & (r & !p) & next(state=S5)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (!r & t & p & !s) & next(state=S0)) |
  (state=S3 & (!r & t & !p & s) & next(state=S1)) |
  (state=S3 & ((r & !t) | (r & t & p)) & next(state=S2)) |
  (state=S3 & ((!r & !t) | (!r & t & p & s)) & next(state=S3)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S4)) |
  (state=S3 & (r & t & !p) & next(state=S5)) |
  (state=S4 & (!r & p & !s) & next(state=S0)) |
  (state=S4 & (!r & !p & s) & next(state=S1)) |
  (state=S4 & (r & p) & next(state=S2)) |
  (state=S4 & (!r & p & s) & next(state=S3)) |
  (state=S4 & (!r & !p & !s) & next(state=S4)) |
  (state=S4 & (r & !p) & next(state=S5)) |
  (state=S5 & (p) & next(state=S2)) |
  (state=S5 & (!p) & next(state=S5)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3 | state=S4);
}

pattern pattern43(q, t, p, s) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !s) & next(state=S1)) |
  (state=S0 & (q & s) & next(state=S3)) |
  (state=S1 & (!s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S3)) |
  (state=S2 & (p & !s) & next(state=S1)) |
  (state=S2 & (!p & !s) & next(state=S2)) |
  (state=S2 & (p & s) & next(state=S3)) |
  (state=S2 & (!p & s) & next(state=S4)) |
  (state=S3 & (t & p & !s) & next(state=S1)) |
  (state=S3 & (t & !p & !s) & next(state=S2)) |
  (state=S3 & ((!t) | (t & p & s)) & next(state=S3)) |
  (state=S3 & (t & !p & s) & next(state=S4)) |
  (state=S4 & (t & p & !s) & next(state=S1)) |
  (state=S4 & (t & !p & !s) & next(state=S2)) |
  (state=S4 & ((!t & p) | (t & p & s)) & next(state=S3)) |
  (state=S4 & ((!t & !p) | (t & !p & s)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern44(r, t, p, s, q) {
  var { S0, S1, S2, S3, S4, S5, S6, S7} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & !s & q) & next(state=S2)) |
  (state=S0 & (!r & s & q) & next(state=S4)) |
  (state=S1 & (r & p) & next(state=S0)) |
  (state=S1 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S1)) |
  (state=S1 & (!r & t & p & !s) & next(state=S2)) |
  (state=S1 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S4)) |
  (state=S1 & (!r & t & !p & !s) & next(state=S5)) |
  (state=S1 & (r & !p) & next(state=S7)) |
  (state=S2 & (r) & next(state=S0)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S4)) |
  (state=S3 & (r & p) & next(state=S0)) |
  (state=S3 & (!r & t & p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S3)) |
  (state=S3 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S4)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S6)) |
  (state=S3 & (r & !p) & next(state=S7)) |
  (state=S4 & ((r & !t) | (r & t & p)) & next(state=S0)) |
  (state=S4 & (!r & t & !p & s) & next(state=S1)) |
  (state=S4 & (!r & t & p & !s) & next(state=S2)) |
  (state=S4 & ((!r & !t) | (!r & t & p & s)) & next(state=S4)) |
  (state=S4 & (!r & t & !p & !s) & next(state=S5)) |
  (state=S4 & (r & t & !p) & next(state=S7)) |
  (state=S5 & (r & p) & next(state=S0)) |
  (state=S5 & (!r & !p & s) & next(state=S1)) |
  (state=S5 & (!r & p & !s) & next(state=S2)) |
  (state=S5 & (!r & p & s) & next(state=S4)) |
  (state=S5 & (!r & !p & !s) & next(state=S5)) |
  (state=S5 & (r & !p) & next(state=S7)) |
  (state=S6 & (r & p) & next(state=S0)) |
  (state=S6 & (!r & p & !s) & next(state=S2)) |
  (state=S6 & (!r & !p & s) & next(state=S3)) |
  (state=S6 & (!r & p & s) & next(state=S4)) |
  (state=S6 & (!r & !p & !s) & next(state=S6)) |
  (state=S6 & (r & !p) & next(state=S7)) |
  (state=S7 & ((p & !q) | (r & p & q)) & next(state=S0)) |
  (state=S7 & (!r & p & !s & q) & next(state=S2)) |
  (state=S7 & (!r & !p & s & q) & next(state=S3)) |
  (state=S7 & (!r & p & s & q) & next(state=S4)) |
  (state=S7 & (!r & !p & !s & q) & next(state=S6)) |
  (state=S7 & ((!p & !q) | (r & !p & q)) & next(state=S7)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S4 | state=S5);
}

pattern pattern45(q, r, t, p, s) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (q & r)) & next(state=S0)) |
  (state=S0 & (q & !r & !s) & next(state=S1)) |
  (state=S0 & (q & !r & s) & next(state=S3)) |
  (state=S1 & (r) & next(state=S0)) |
  (state=S1 & (!r & !s) & next(state=S1)) |
  (state=S1 & (!r & s) & next(state=S3)) |
  (state=S2 & (r & p) & next(state=S0)) |
  (state=S2 & (!r & p & !s) & next(state=S1)) |
  (state=S2 & (!r & !p & !s) & next(state=S2)) |
  (state=S2 & (!r & p & s) & next(state=S3)) |
  (state=S2 & (r & !p) & next(state=S4)) |
  (state=S2 & (!r & !p & s) & next(state=S5)) |
  (state=S3 & ((r & !t) | (r & t & p)) & next(state=S0)) |
  (state=S3 & (!r & t & p & !s) & next(state=S1)) |
  (state=S3 & (!r & t & !p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !t) | (!r & t & p & s)) & next(state=S3)) |
  (state=S3 & (r & t & !p) & next(state=S4)) |
  (state=S3 & (!r & t & !p & s) & next(state=S5)) |
  (state=S4 & ((!q & p) | (q & r & p)) & next(state=S0)) |
  (state=S4 & (q & !r & p & !s) & next(state=S1)) |
  (state=S4 & (q & !r & !p & !s) & next(state=S2)) |
  (state=S4 & (q & !r & p & s) & next(state=S3)) |
  (state=S4 & ((!q & !p) | (q & r & !p)) & next(state=S4)) |
  (state=S4 & (q & !r & !p & s) & next(state=S5)) |
  (state=S5 & (r & p) & next(state=S0)) |
  (state=S5 & (!r & t & p & !s) & next(state=S1)) |
  (state=S5 & (!r & t & !p & !s) & next(state=S2)) |
  (state=S5 & ((!r & !t & p) | (!r & t & p & s)) & next(state=S3)) |
  (state=S5 & (r & !p) & next(state=S4)) |
  (state=S5 & ((!r & !t & !p) | (!r & t & !p & s)) & next(state=S5)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern46(p, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & (p & !s) & next(state=S1)) |
  (state=S0 & (p & s) & next(state=S4)) |
  (state=S1 & (!s) & next(state=S1)) |
  (state=S1 & (s) & next(state=S3)) |
  (state=S2 & (!s & t) & next(state=S1)) |
  (state=S2 & (!s & !t) & next(state=S2)) |
  (state=S2 & (s & t) & next(state=S3)) |
  (state=S2 & (s & !t) & next(state=S4)) |
  (state=S3 & (!p & t) & next(state=S0)) |
  (state=S3 & (p & !s & t) & next(state=S1)) |
  (state=S3 & (p & !s & !t) & next(state=S2)) |
  (state=S3 & (p & s & t) & next(state=S3)) |
  (state=S3 & ((!p & !t) | (p & s & !t)) & next(state=S4)) |
  (state=S4 & (!p & t) & next(state=S0)) |
  (state=S4 & (p & !s & t) & next(state=S1)) |
  (state=S4 & (p & !s & !t) & next(state=S2)) |
  (state=S4 & (p & s & t) & next(state=S3)) |
  (state=S4 & ((!p & !t) | (p & s & !t)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S3);
}

pattern pattern47(r, p, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & (!r & p & !s) & next(state=S2)) |
  (state=S0 & (!r & p & s) & next(state=S3)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (!r & s) & next(state=S3)) |
  (state=S2 & (r) & next(state=S4)) |
  (state=S3 & (!r & !p & t) & next(state=S0)) |
  (state=S3 & (r & t) & next(state=S1)) |
  (state=S3 & (!r & p & !s) & next(state=S2)) |
  (state=S3 & ((!r & !p & !t) | (!r & p & s)) & next(state=S3)) |
  (state=S3 & (r & !t) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S3);
}

pattern pattern48(q, p, s, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p & !s) & next(state=S2)) |
  (state=S0 & (q & p & s) & next(state=S3)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p & !s) & next(state=S2)) |
  (state=S1 & (p & s) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (!p & t) & next(state=S1)) |
  (state=S3 & (p & !s) & next(state=S2)) |
  (state=S3 & ((!p & !t) | (p & s)) & next(state=S4)) |
  (state=S4 & (!p & t) & next(state=S1)) |
  (state=S4 & (p & !s) & next(state=S2)) |
  (state=S4 & (p & s & t) & next(state=S3)) |
  (state=S4 & ((!p & !t) | (p & s & !t)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern49(r, p, s, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & (!r & p & s & q) & next(state=S1)) |
  (state=S0 & (!r & p & !s & q) & next(state=S2)) |
  (state=S0 & (!r & !p & q) & next(state=S4)) |
  (state=S1 & (r & t) & next(state=S0)) |
  (state=S1 & ((!r & !p & !t) | (!r & p & s)) & next(state=S1)) |
  (state=S1 & (!r & p & !s) & next(state=S2)) |
  (state=S1 & (r & !t) & next(state=S3)) |
  (state=S1 & (!r & !p & t) & next(state=S4)) |
  (state=S2 & (!r & s) & next(state=S1)) |
  (state=S2 & (!r & !s) & next(state=S2)) |
  (state=S2 & (r) & next(state=S3)) |
  (state=S3 & TRUE & next(state=S3)) |
  (state=S4 & (r) & next(state=S0)) |
  (state=S4 & (!r & p & s) & next(state=S1)) |
  (state=S4 & (!r & p & !s) & next(state=S2)) |
  (state=S4 & (!r & !p) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S2 | state=S4);
}

pattern pattern51(p, s, z, t) {
  var { S0, S1, S2, S3, S4, S5} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!p) & next(state=S0)) |
  (state=S0 & ((p & !s) | (p & s & z)) & next(state=S2)) |
  (state=S0 & (p & s & !z) & next(state=S3)) |
  (state=S1 & (!p & t) & next(state=S0)) |
  (state=S1 & ((p & !s & t) | (p & s & z & t)) & next(state=S2)) |
  (state=S1 & ((!p & !z & !t) | (p & s & !z)) & next(state=S3)) |
  (state=S1 & ((p & !s & !t) | (!p & z & !t) | (p & s & z & !t)) & next(state=S4)) |
  (state=S2 & (s & !z & t) & next(state=S1)) |
  (state=S2 & (!s & !z & !t) & next(state=S2)) |
  (state=S2 & (s & !z & !t) & next(state=S3)) |
  (state=S2 & (z & !t) & next(state=S4)) |
  (state=S2 & ((!s & t) | (s & z & t)) & next(state=S5)) |
  (state=S3 & (!p & t) & next(state=S0)) |
  (state=S3 & (p & s & !z & t) & next(state=S1)) |
  (state=S3 & (p & !s & !z & !t) & next(state=S2)) |
  (state=S3 & ((!p & !z & !t) | (p & s & !z & !t)) & next(state=S3)) |
  (state=S3 & (z & !t) & next(state=S4)) |
  (state=S3 & ((p & !s & t) | (p & s & z & t)) & next(state=S5)) |
  (state=S4 & (s & !z) & next(state=S3)) |
  (state=S4 & ((!s) | (s & z)) & next(state=S4)) |
  (state=S5 & (s & !z) & next(state=S3)) |
  (state=S5 & ((!s) | (s & z)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S5);
}

pattern pattern52(r, p, s, z, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!r & !p) & next(state=S0)) |
  (state=S0 & (r) & next(state=S1)) |
  (state=S0 & ((!r & p & !s) | (!r & p & s & z)) & next(state=S3)) |
  (state=S0 & (!r & p & s & !z) & next(state=S4)) |
  (state=S1 & TRUE & next(state=S1)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S2)) |
  (state=S3 & ((!r & !s) | (!r & s & z)) & next(state=S3)) |
  (state=S3 & (!r & s & !z) & next(state=S4)) |
  (state=S4 & (!r & !p & t) & next(state=S0)) |
  (state=S4 & (r & t) & next(state=S1)) |
  (state=S4 & (r & !t) & next(state=S2)) |
  (state=S4 & ((!r & p & !s) | (!r & !p & z & !t) | (!r & p & s & z)) & next(state=S3)) |
  (state=S4 & ((!r & !p & !z & !t) | (!r & p & s & !z)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3 | state=S4);
}

pattern pattern53(q, p, s, z, t) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & (!q) & next(state=S0)) |
  (state=S0 & (q & !p) & next(state=S1)) |
  (state=S0 & (q & p & s & !z) & next(state=S2)) |
  (state=S0 & ((q & p & !s) | (q & p & s & z)) & next(state=S4)) |
  (state=S1 & (!p) & next(state=S1)) |
  (state=S1 & (p & s & !z) & next(state=S2)) |
  (state=S1 & ((p & !s) | (p & s & z)) & next(state=S4)) |
  (state=S2 & (!p & t) & next(state=S1)) |
  (state=S2 & ((!p & !z & !t) | (p & s & !z & !t)) & next(state=S2)) |
  (state=S2 & (p & s & !z & t) & next(state=S3)) |
  (state=S2 & ((p & !s) | (!p & z & !t) | (p & s & z)) & next(state=S4)) |
  (state=S3 & (!p & t) & next(state=S1)) |
  (state=S3 & ((!p & !z & !t) | (p & s & !z)) & next(state=S2)) |
  (state=S3 & ((p & !s) | (!p & z & !t) | (p & s & z)) & next(state=S4)) |
  (state=S4 & TRUE & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3);
}

pattern pattern54(r, p, s, z, t, q) {
  var { S0, S1, S2, S3, S4} state;

  -- initial assignments: initial state
  state=S0;

  -- safety this and next state
  G ((state=S0 & ((!q) | (r & q)) & next(state=S0)) |
  (state=S0 & ((!r & p & !s & q) | (!r & p & s & z & q)) & next(state=S1)) |
  (state=S0 & (!r & !p & q) & next(state=S3)) |
  (state=S0 & (!r & p & s & !z & q) & next(state=S4)) |
  (state=S1 & ((!r & !s) | (!r & s & z)) & next(state=S1)) |
  (state=S1 & (r) & next(state=S2)) |
  (state=S1 & (!r & s & !z) & next(state=S4)) |
  (state=S2 & TRUE & next(state=S2)) |
  (state=S3 & (r) & next(state=S0)) |
  (state=S3 & ((!r & p & !s) | (!r & p & s & z)) & next(state=S1)) |
  (state=S3 & (!r & !p) & next(state=S3)) |
  (state=S3 & (!r & p & s & !z) & next(state=S4)) |
  (state=S4 & (r & t) & next(state=S0)) |
  (state=S4 & ((!r & p & !s) | (!r & !p & z & !t) | (!r & p & s & z)) & next(state=S1)) |
  (state=S4 & (r & !t) & next(state=S2)) |
  (state=S4 & (!r & !p & t) & next(state=S3)) |
  (state=S4 & ((!r & !p & !z & !t) | (!r & p & s & !z)) & next(state=S4)));

  -- equivalence of satisfaction
  GF (state=S0 | state=S1 | state=S3 | state=S4);
}

`.trimStart();