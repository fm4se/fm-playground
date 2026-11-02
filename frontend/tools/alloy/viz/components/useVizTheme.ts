import { useCallback, useEffect, useRef, useState } from 'react';
import { AlloyModel } from '../core/model';
import { VizTheme } from '../core/theme';
import { loadTheme, modelSignature, saveTheme } from '../core/themeStorage';

/**
 * The theme of the current session. Like in the Alloy Analyzer, it carries over
 * to the next instance (even of an edited model) unless a theme was saved for
 * that exact model.
 */
let sessionTheme: VizTheme | null = null;

function themeFor(model: AlloyModel | null, signature: string | null): VizTheme {
    return (signature && loadTheme(signature)) || sessionTheme || VizTheme.createDefault(model ?? undefined);
}

/** Theme state for a model, persisted per model signature. */
export function useVizTheme(model: AlloyModel | null): [VizTheme, (theme: VizTheme) => void] {
    const signature = model ? modelSignature(model) : null;
    const [theme, setThemeState] = useState<VizTheme>(() => themeFor(model, signature));
    const lastSignature = useRef(signature);

    useEffect(() => {
        if (signature === lastSignature.current) return;
        lastSignature.current = signature;
        if (signature) setThemeState(themeFor(model, signature));
    }, [model, signature]);

    const setTheme = useCallback(
        (t: VizTheme) => {
            sessionTheme = t;
            setThemeState(t);
            if (signature) saveTheme(signature, t);
        },
        [signature]
    );
    return [theme, setTheme];
}
