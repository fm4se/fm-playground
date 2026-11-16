import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAtom } from 'jotai';
import { MDBBtn, MDBTabs, MDBTabsItem, MDBTabsLink } from 'mdb-react-ui-kit';
import { TbListDetails, TbBulb, TbArrowsExchange } from 'react-icons/tb';
import { smtDiffWitnessAtom } from '@/atoms';
import { errorMessage, explainSmtDiffWitness, getNextSmtDiffWitness } from '../smtDiffExecutor';
import { jotaiStore, permalinkAtom } from '@/atoms';
import { logToDb } from '@/api/playgroundApi';
import { SmtDiffBanner, SmtDiffRun, SmtDirection, SmtExplanationEntry, SmtWitnessStep } from '../smtDiffTypes';
import SmtModelView, { LogicNote } from './SmtModelView';
import { AbductivePane, CounterfactualPane } from './SmtExplanationPanes';
import './SMTDiff.css';

type Tab = 'output' | 'abductive' | 'counterfactual';

const explanationKey = (direction: SmtDirection, witnessIndex: number) => `${direction}:${witnessIndex}`;

/** The relation or region of the analysis, as a coloured collapsible banner (as in alloy-diff). */
const Banner = ({ banner }: { banner: SmtDiffBanner }) => (
    <div className={`smt-diff-banner smt-diff-banner-${banner.kind}`}>
        {banner.detail ? (
            <details>
                <summary>{banner.summary}</summary>
                {banner.detail}
            </details>
        ) : (
            <span>{banner.summary}</span>
        )}
    </div>
);

const SmtDiffOutput = () => {
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const interval = setInterval(() => {
            const target = document.getElementById('diff-navigation-portal-target');
            if (target) {
                setPortalTarget(target);
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    const [run] = useAtom(smtDiffWitnessAtom) as [SmtDiffRun | null, unknown];
    const permalink = jotaiStore.get(permalinkAtom);
    const [witnesses, setWitnesses] = useState<SmtWitnessStep[]>([]);
    const [currentWitnessIndex, setCurrentWitnessIndex] = useState(0);
    const [isNextWitnessExecuting, setIsNextWitnessExecuting] = useState(false);
    const [isLastWitness, setIsLastWitness] = useState(false);
    const [navigationMessage, setNavigationMessage] = useState('');
    const [activeTab, setActiveTab] = useState<Tab>('output');
    const [explanations, setExplanations] = useState<Record<string, SmtExplanationEntry>>({});
    const [isExplaining, setIsExplaining] = useState(false);

    // A new analysis run (or a reset to null) starts from scratch.
    useEffect(() => {
        setWitnesses(run?.firstWitness ? [run.firstWitness] : []);
        setCurrentWitnessIndex(0);
        setIsNextWitnessExecuting(false);
        setIsLastWitness(false);
        setNavigationMessage('');
        setActiveTab('output');
        setExplanations({});
        setIsExplaining(false);
    }, [run]);

    const specId = run?.firstWitness?.specId ?? null;
    const hasWitness = witnesses.length > 0;
    const canExplain = !!run && hasWitness && run.explainable.length > 0;

    /** The region and witness each Explain section is about: the displayed one, else the region's first witness. */
    const explanationTargets = (): [SmtDirection, number][] =>
        (run?.explainable ?? []).map((direction) => [
            direction,
            direction === run?.direction ? currentWitnessIndex : 0,
        ]);

    const currentEntries = explanationTargets()
        .map(([direction, index]) => explanations[explanationKey(direction, index)])
        .filter((entry): entry is SmtExplanationEntry => entry !== undefined);

    const handleNextWitness = () => {
        if (currentWitnessIndex < witnesses.length - 1) {
            setCurrentWitnessIndex(currentWitnessIndex + 1);
            return;
        }
        if (!specId) return;

        setIsNextWitnessExecuting(true);
        getNextSmtDiffWitness(specId, permalink.permalink || '')
            .then((step) => {
                if (step.status === 'sat' && step.witness) {
                    setWitnesses([...witnesses, step]);
                    setCurrentWitnessIndex(witnesses.length);
                } else {
                    setIsLastWitness(true);
                    setNavigationMessage(
                        step.status === 'incomplete'
                            ? 'No more witnesses found (the solver could not decide whether more exist).'
                            : 'No more witnesses.'
                    );
                }
            })
            .catch((error) => {
                setIsLastWitness(true);
                setNavigationMessage(error.response?.status === 404 ? 'No more witnesses.' : errorMessage(error));
            })
            .finally(() => setIsNextWitnessExecuting(false));
    };

    const handlePreviousWitness = () => {
        if (currentWitnessIndex > 0) {
            const prevIndex = currentWitnessIndex - 1;
            setCurrentWitnessIndex(prevIndex);
            setIsLastWitness(false);
            setNavigationMessage('');
            logToDb(permalink.permalink || '', {
                tool: 'SMTSemDiff-Previous',
                witness: witnesses[prevIndex],
                specId: specId,
            });
        }
    };

    const handleExplain = async () => {
        if (!run || !canExplain) return;
        const missing = explanationTargets().filter(
            ([direction, index]) => !explanations[explanationKey(direction, index)]?.explanation
        );
        if (activeTab === 'output') setActiveTab('abductive');
        if (missing.length === 0) return;

        setIsExplaining(true);
        const pending: Record<string, SmtExplanationEntry> = {};
        missing.forEach(([direction, witnessIndex]) => {
            pending[explanationKey(direction, witnessIndex)] = { direction, witnessIndex };
        });
        setExplanations((previous) => ({ ...previous, ...pending }));

        const results = await Promise.all(
            missing.map(async ([direction, witnessIndex]): Promise<SmtExplanationEntry> => {
                try {
                    const explanation = await explainSmtDiffWitness(run.permalink, direction, witnessIndex, run.filter);
                    return { direction, witnessIndex, explanation };
                } catch (error) {
                    return { direction, witnessIndex, error: errorMessage(error) };
                }
            })
        );
        const done: Record<string, SmtExplanationEntry> = {};
        results.forEach((entry) => {
            done[explanationKey(entry.direction, entry.witnessIndex)] = entry;
        });
        setExplanations((previous) => ({ ...previous, ...done }));
        setIsExplaining(false);
    };

    const currentStep = witnesses[currentWitnessIndex];
    const currentExplained = explanationTargets().every(
        ([direction, index]) => explanations[explanationKey(direction, index)]?.explanation
    );

    const navigation = hasWitness && (
        <div className='smt-diff-navigation'>
            <div style={{ display: 'flex', gap: '8px' }}>
                <MDBBtn color='warning' onClick={handlePreviousWitness} disabled={currentWitnessIndex === 0}>
                    Previous
                </MDBBtn>
                <MDBBtn color='success' onClick={handleNextWitness} disabled={isNextWitnessExecuting || isLastWitness}>
                    {isNextWitnessExecuting ? 'Computing...' : 'Next'}
                </MDBBtn>
                {canExplain && (
                    <MDBBtn color='info' onClick={handleExplain} disabled={isExplaining}>
                        {isExplaining ? 'Explaining...' : currentExplained ? 'Show Explanation' : 'Explain'}
                    </MDBBtn>
                )}
            </div>
            {navigationMessage && <span className='smt-diff-muted'>{navigationMessage}</span>}
        </div>
    );

    if (!run) {
        return null;
    }

    return (
        <div className='smt-diff'>
            <Banner banner={run.banner} />
            {hasWitness ? (
                <>
                    <MDBTabs justify>
                        <MDBTabsItem>
                            <MDBTabsLink onClick={() => setActiveTab('output')} active={activeTab === 'output'}>
                                <TbListDetails /> Output
                            </MDBTabsLink>
                        </MDBTabsItem>
                        {canExplain && (
                            <>
                                <MDBTabsItem>
                                    <MDBTabsLink
                                        onClick={() => setActiveTab('abductive')}
                                        active={activeTab === 'abductive'}
                                    >
                                        <TbBulb /> Abductive Explanation
                                    </MDBTabsLink>
                                </MDBTabsItem>
                                <MDBTabsItem>
                                    <MDBTabsLink
                                        onClick={() => setActiveTab('counterfactual')}
                                        active={activeTab === 'counterfactual'}
                                    >
                                        <TbArrowsExchange /> Counterfactual Explanation
                                    </MDBTabsLink>
                                </MDBTabsItem>
                            </>
                        )}
                    </MDBTabs>
                    {/* The only scrolling area: it fills the rest of the output column. */}
                    <div className='smt-diff-pane'>
                        {activeTab === 'output' && (
                            <>
                                <div className='smt-diff-pane-toolbar'>
                                    <strong>Witness #{currentWitnessIndex + 1}</strong>
                                    <LogicNote logic={currentStep?.logic ?? null} />
                                </div>
                                {currentStep?.witness && <SmtModelView model={currentStep.witness} />}
                            </>
                        )}
                        {activeTab === 'abductive' && (
                            <AbductivePane
                                entries={currentEntries}
                                displayedDirection={run.direction}
                                isExplaining={isExplaining}
                                canExplain={canExplain}
                            />
                        )}
                        {activeTab === 'counterfactual' && (
                            <CounterfactualPane
                                entries={currentEntries}
                                displayedDirection={run.direction}
                                isExplaining={isExplaining}
                                canExplain={canExplain}
                            />
                        )}
                    </div>
                    {portalTarget ? createPortal(navigation, portalTarget) : navigation}
                </>
            ) : null}
        </div>
    );
};

export default SmtDiffOutput;
