import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, List, ListSubheader, InputBase, IconButton, CircularProgress, Chip } from '@mui/material';
import { MdRefresh, MdPushPin, MdOutlinePushPin, MdSearch, MdClose } from 'react-icons/md';
import { useAtom } from 'jotai';
import { historyRefreshTriggerAtom } from '@/atoms';
import {
    getHistoryByPage,
    getPinnedHistory,
    searchUserHistory,
    getCodeById,
    updateHistoryTitle,
    updateHistoryTags,
    updateHistoryPinned,
} from '@/api/playgroundApi';
import HistoryItem from './HistoryItem';
import type { DrawerComponentProps, HistoryItemDTO } from './types';

function groupByDate(items: HistoryItemDTO[]) {
    const groups: Record<string, HistoryItemDTO[]> = { Today: [], Yesterday: [], Earlier: [] };
    const now = new Date();
    const todayStr = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    for (const it of items) {
        const d = it.time_iso ? new Date(it.time_iso) : null;
        const key = d
            ? d.toDateString() === todayStr
                ? 'Today'
                : d.toDateString() === yesterdayStr
                  ? 'Yesterday'
                  : 'Earlier'
            : 'Earlier';
        groups[key].push(it);
    }
    return groups;
}

const HistoryDrawer: React.FC<DrawerComponentProps> = ({
    isOpen,
    onClose,
    onItemSelect,
    isDarkTheme = false,
    isLoggedIn,
    selectedTool,
}) => {
    const [historyRefreshTrigger] = useAtom(historyRefreshTriggerAtom);
    const [shouldRefreshOnOpen, setShouldRefreshOnOpen] = useState(false);
    const [data, setData] = useState<HistoryItemDTO[]>([]);
    const [pinnedData, setPinnedData] = useState<HistoryItemDTO[]>([]);
    const [searchData, setSearchData] = useState<HistoryItemDTO[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMoreData, setHasMoreData] = useState(true);
    const [isDrawerPinned, setIsDrawerPinned] = useState(false);
    const [showPinnedOnly, setShowPinnedOnly] = useState(false);
    const [searchIn, setSearchIn] = useState<'all' | 'code' | 'title' | 'tags'>('all');
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [fullCodeCache, setFullCodeCache] = useState<Record<number, string>>({});
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const drawerRef = useRef<HTMLDivElement | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const uniqueData = useMemo(() => {
        const ids = new Set<number>();
        const list: HistoryItemDTO[] = [];
        (data || []).forEach((it) => {
            if (!ids.has(it.id)) {
                ids.add(it.id);
                list.push(it);
            }
        });
        return list;
    }, [data]);

    const uniquePinnedData = useMemo(() => {
        const ids = new Set<number>();
        const list: HistoryItemDTO[] = [];
        (pinnedData || []).forEach((it) => {
            if (!ids.has(it.id)) {
                ids.add(it.id);
                list.push(it);
            }
        });
        return list;
    }, [pinnedData]);

    const uniqueSearchData = useMemo(() => {
        const ids = new Set<number>();
        const list: HistoryItemDTO[] = [];
        (searchData || []).forEach((it) => {
            if (!ids.has(it.id)) {
                ids.add(it.id);
                list.push(it);
            }
        });
        return list;
    }, [searchData]);

    const fetchData = useCallback(
        async (pageNumber: number) => {
            try {
                setLoading(true);
                const res = await getHistoryByPage(pageNumber, selectedTool);
                const hist = res?.history || [];
                if (pageNumber === 1) setData(hist);
                else setData((prev) => [...prev, ...hist]);
                setHasMoreData(!!res?.has_more_data);
                setPage((p) => p + 1);
            } catch (e) {
                // Error fetching history
                console.error('Error fetching history', e);
            } finally {
                setLoading(false);
            }
        },
        [selectedTool]
    );

    const fetchPinnedData = async () => {
        try {
            setLoading(true);
            const res = await getPinnedHistory(selectedTool);
            const hist = res?.history || [];
            setPinnedData(hist);
        } catch (e) {
            console.error('Error fetching pinned history', e);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const id = setTimeout(async () => {
            if (!debouncedSearchQuery) {
                setSearchData([]);
                return;
            }
            try {
                setLoading(true);
                const res = await searchUserHistory(debouncedSearchQuery, selectedTool, searchIn);
                setSearchData(res?.history || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 400);
        return () => clearTimeout(id);
    }, [debouncedSearchQuery, selectedTool, searchIn]);

    const handleItemClick = async (item: HistoryItemDTO) => {
        try {
            const cached = fullCodeCache[item.id];
            if (cached) {
                onItemSelect(item.check, item.permalink, cached, item.id);
            } else {
                const res = await getCodeById(item.id);
                if (res?.code) {
                    onItemSelect(res.check, res.permalink, res.code, item.id);
                    setFullCodeCache((prev) => ({ ...prev, [item.id]: res.code }));
                }
            }
            onClose();
            setSelectedItemId(item.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleItemHover = async (id: number) => {
        if (fullCodeCache[id]) return;
        try {
            const res = await getCodeById(id);
            if (res?.code) setFullCodeCache((prev) => ({ ...prev, [id]: res.code }));
        } catch (e) {
            console.error(e);
        }
    };

    const handleRefresh = useCallback(
        async (isAutoRefresh: boolean = false) => {
            try {
                const res = await getHistoryByPage(1, selectedTool);
                const hist = res?.history || [];
                if (isAutoRefresh) {
                    setData(hist);
                    setPage(1);
                } else {
                    const newIds = new Set(hist.map((h: HistoryItemDTO) => h.id));
                    setData((prev) => [...hist, ...prev.filter((p) => !newIds.has(p.id))]);
                }

                // Also refresh pinned data if we're in pinned view
                if (showPinnedOnly) {
                    await fetchPinnedData();
                }
            } catch (e) {
                console.error(e);
            }
        },
        [selectedTool, showPinnedOnly]
    );

    useEffect(() => {
        if (!debouncedSearchQuery) {
            if (isOpen) handleRefresh(true);
            else setShouldRefreshOnOpen(true);
        }
    }, [historyRefreshTrigger, isOpen, debouncedSearchQuery, handleRefresh]);

    useEffect(() => {
        if (isOpen && shouldRefreshOnOpen && !debouncedSearchQuery) {
            void handleRefresh(true);
            setShouldRefreshOnOpen(false);
        }
    }, [isOpen, shouldRefreshOnOpen, debouncedSearchQuery, handleRefresh]);

    // Intersection Observer for infinite scroll
    useEffect(() => {
        const currentLoadMoreRef = loadMoreRef.current;

        if (!currentLoadMoreRef) {
            // No loadMoreRef, skipping observer setup
            return;
        }

        // Setting up Intersection Observer

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    // Only trigger when the sentinel is visible and we should load more
                    if (entry.isIntersecting && !loading && hasMoreData && !debouncedSearchQuery && !showPinnedOnly) {
                        // Fetching more data for page:
                        void fetchData(page);
                    }
                });
            },
            {
                root: null, // Use viewport as root
                rootMargin: '200px', // Start loading 200px before reaching the sentinel
                threshold: 0.01,
            }
        );

        observer.observe(currentLoadMoreRef);

        return () => {
            // Cleaning up observer
            observer.disconnect();
        };
    }, [loading, hasMoreData, debouncedSearchQuery, showPinnedOnly, page, fetchData]);

    useEffect(() => {
        setData([]);
        setSearchData([]);
        setPinnedData([]);
        setPage(1);
        setHasMoreData(true);
        if (isOpen) void fetchData(1);
    }, [selectedTool]);

    useEffect(() => {
        if (isOpen && page === 1) void fetchData(1);
    }, [isOpen]);

    // Fetch pinned data when showPinnedOnly is enabled
    useEffect(() => {
        if (showPinnedOnly && !debouncedSearchQuery) {
            void fetchPinnedData();
        }
    }, [showPinnedOnly, selectedTool, debouncedSearchQuery]);

    const groups = useMemo(() => {
        // When searching, use search results
        if (debouncedSearchQuery) {
            const filtered = showPinnedOnly ? uniqueSearchData.filter((it) => !!it.pinned) : uniqueSearchData;
            return groupByDate(filtered);
        }
        // When showing pinned only, use pinned data from API
        if (showPinnedOnly) {
            return groupByDate(uniquePinnedData);
        }
        // Default: show all data
        return groupByDate(uniqueData);
    }, [debouncedSearchQuery, uniqueSearchData, uniqueData, uniquePinnedData, showPinnedOnly]);

    const handleTitleChange = async (id: number, title: string) => {
        // optimistic update
        setData((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
        setSearchData((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
        setPinnedData((prev) => prev.map((it) => (it.id === id ? { ...it, title } : it)));
        await updateHistoryTitle(id, title);
    };

    const handleTagsChange = async (id: number, tags: string[]) => {
        // optimistic update
        const encoded = JSON.stringify(tags);
        setData((prev) => prev.map((it) => (it.id === id ? { ...it, tags: encoded } : it)));
        setSearchData((prev) => prev.map((it) => (it.id === id ? { ...it, tags: encoded } : it)));
        setPinnedData((prev) => prev.map((it) => (it.id === id ? { ...it, tags: encoded } : it)));
        await updateHistoryTags(id, tags);
    };

    const handlePinToggle = async (id: number, pinned: boolean) => {
        // optimistic update
        setData((prev) => prev.map((it) => (it.id === id ? { ...it, pinned } : it)));
        setSearchData((prev) => prev.map((it) => (it.id === id ? { ...it, pinned } : it)));
        setPinnedData((prev) => {
            if (pinned) {
                // Item was pinned - add if not already present
                const existing = prev.find((it) => it.id === id);
                if (!existing) {
                    // Find the item in data or searchData to add to pinned
                    const item = [...data, ...searchData].find((it) => it.id === id);
                    if (item) {
                        return [{ ...item, pinned: true }, ...prev];
                    }
                }
                return prev.map((it) => (it.id === id ? { ...it, pinned: true } : it));
            } else {
                // Item was unpinned - remove from pinned list
                return prev.filter((it) => it.id !== id);
            }
        });
        await updateHistoryPinned(id, pinned);
    };

    return (
        <Drawer
            ref={drawerRef as any}
            variant={isDrawerPinned ? 'permanent' : 'temporary'}
            anchor='right'
            open={isOpen}
            onClose={onClose}
            ModalProps={{ disableScrollLock: true }}
            sx={{
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: 320,
                    boxSizing: 'border-box',
                    overflowX: 'hidden',
                    backgroundColor: isDarkTheme ? '#1e1e1e' : '#fff',
                    color: isDarkTheme ? '#fff' : '#000',
                },
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Sticky Header Area */}
                <div
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: isDarkTheme ? '#1e1e1e' : '#fff',
                    }}
                >
                    {/* Search Bar */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderBottom: `1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                        }}
                    >
                        <div
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                background: isDarkTheme ? '#2d2d2d' : '#f2f2f2',
                                borderRadius: 6,
                                padding: '4px 8px',
                            }}
                        >
                            <MdSearch style={{ color: isDarkTheme ? '#aaa' : '#666' }} />
                            <InputBase
                                placeholder='Search'
                                value={debouncedSearchQuery}
                                onChange={(e) => {
                                    setDebouncedSearchQuery(e.target.value);
                                    setPage(1);
                                }}
                                fullWidth
                                sx={{
                                    color: isDarkTheme ? '#fff' : '#000',
                                    '& ::placeholder': {
                                        color: isDarkTheme ? '#aaa' : '#666',
                                        opacity: 1,
                                    },
                                }}
                            />
                            {debouncedSearchQuery && (
                                <IconButton
                                    size='small'
                                    onClick={() => {
                                        setDebouncedSearchQuery('');
                                        setPage(1);
                                    }}
                                    aria-label='clear search'
                                    sx={{
                                        padding: '2px',
                                        color: isDarkTheme ? '#aaa' : '#666',
                                        '&:hover': {
                                            color: isDarkTheme ? '#fff' : '#000',
                                        },
                                    }}
                                >
                                    <MdClose size={18} />
                                </IconButton>
                            )}
                        </div>
                        <IconButton
                            size='small'
                            onClick={() => setIsDrawerPinned((p) => !p)}
                            aria-label='pin drawer'
                            title={isDrawerPinned ? 'Unpin drawer' : 'Pin drawer open'}
                            sx={{ color: isDarkTheme ? '#fff' : undefined }}
                        >
                            {isDrawerPinned ? <MdPushPin /> : <MdOutlinePushPin />}
                        </IconButton>
                        <IconButton
                            size='small'
                            onClick={() => handleRefresh(false)}
                            aria-label='refresh'
                            sx={{ color: isDarkTheme ? '#fff' : undefined }}
                        >
                            <MdRefresh />
                        </IconButton>
                    </div>

                    {/* All/Pinned Filter */}
                    <div
                        style={{
                            display: 'flex',
                            gap: 4,
                            alignItems: 'center',
                            padding: '4px 12px',
                            borderBottom: `1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                        }}
                    >
                        <Chip
                            label='All'
                            size='small'
                            onClick={() => setShowPinnedOnly(false)}
                            color={!showPinnedOnly ? 'primary' : 'default'}
                            variant={!showPinnedOnly ? 'filled' : 'outlined'}
                            sx={{
                                ...(showPinnedOnly &&
                                    isDarkTheme && {
                                        color: '#fff',
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                    }),
                            }}
                        />
                        <Chip
                            label='Pinned'
                            size='small'
                            onClick={() => setShowPinnedOnly(true)}
                            color={showPinnedOnly ? 'primary' : 'default'}
                            variant={showPinnedOnly ? 'filled' : 'outlined'}
                            icon={<MdPushPin size={14} />}
                            sx={{
                                ...(!showPinnedOnly &&
                                    isDarkTheme && {
                                        color: '#fff',
                                        borderColor: 'rgba(255, 255, 255, 0.23)',
                                        '& .MuiChip-icon': {
                                            color: '#fff',
                                        },
                                    }),
                            }}
                        />
                    </div>

                    {/* Search In Filter (when searching) */}
                    {debouncedSearchQuery && (
                        <div
                            style={{
                                display: 'flex',
                                gap: 4,
                                alignItems: 'center',
                                padding: '4px 12px',
                                borderBottom: `1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                                fontSize: '0.75rem',
                            }}
                        >
                            <span
                                style={{ opacity: 0.7, minWidth: 'fit-content', color: isDarkTheme ? '#fff' : '#000' }}
                            >
                                Search in:
                            </span>
                            <Chip
                                label='All'
                                size='small'
                                onClick={() => setSearchIn('all')}
                                color={searchIn === 'all' ? 'primary' : 'default'}
                                variant={searchIn === 'all' ? 'filled' : 'outlined'}
                                sx={{
                                    ...(searchIn !== 'all' &&
                                        isDarkTheme && {
                                            color: '#fff',
                                            borderColor: 'rgba(255, 255, 255, 0.23)',
                                        }),
                                }}
                            />
                            <Chip
                                label='Title'
                                size='small'
                                onClick={() => setSearchIn('title')}
                                color={searchIn === 'title' ? 'primary' : 'default'}
                                variant={searchIn === 'title' ? 'filled' : 'outlined'}
                                sx={{
                                    ...(searchIn !== 'title' &&
                                        isDarkTheme && {
                                            color: '#fff',
                                            borderColor: 'rgba(255, 255, 255, 0.23)',
                                        }),
                                }}
                            />
                            <Chip
                                label='Tags'
                                size='small'
                                onClick={() => setSearchIn('tags')}
                                color={searchIn === 'tags' ? 'primary' : 'default'}
                                variant={searchIn === 'tags' ? 'filled' : 'outlined'}
                                sx={{
                                    ...(searchIn !== 'tags' &&
                                        isDarkTheme && {
                                            color: '#fff',
                                            borderColor: 'rgba(255, 255, 255, 0.23)',
                                        }),
                                }}
                            />
                            <Chip
                                label='Specification'
                                size='small'
                                onClick={() => setSearchIn('code')}
                                color={searchIn === 'code' ? 'primary' : 'default'}
                                variant={searchIn === 'code' ? 'filled' : 'outlined'}
                                sx={{
                                    ...(searchIn !== 'code' &&
                                        isDarkTheme && {
                                            color: '#fff',
                                            borderColor: 'rgba(255, 255, 255, 0.23)',
                                        }),
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Scrollable List Area */}
                <div style={{ flex: 1, overflowY: 'auto' }} ref={drawerRef as any}>
                    {loading &&
                    ((page === 1 && data.length === 0 && !debouncedSearchQuery && !showPinnedOnly) ||
                        (showPinnedOnly && pinnedData.length === 0) ||
                        (debouncedSearchQuery && searchData.length === 0)) ? (
                        // Initial loading state
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: '100%',
                                gap: 8,
                            }}
                        >
                            <CircularProgress size={32} sx={{ color: isDarkTheme ? '#fff' : undefined }} />
                            <span
                                style={{
                                    fontSize: '0.875rem',
                                    color: isDarkTheme ? '#aaa' : '#666',
                                }}
                            >
                                {debouncedSearchQuery
                                    ? 'Searching...'
                                    : showPinnedOnly
                                      ? 'Loading pinned items...'
                                      : 'Loading history...'}
                            </span>
                        </div>
                    ) : (
                        <List sx={{ padding: 0 }}>
                            {Object.entries(groups).map(([label, items]) =>
                                items.length > 0 ? (
                                    <li key={label} style={{ listStyle: 'none' }}>
                                        <ul style={{ padding: 0, margin: 0 }}>
                                            <ListSubheader
                                                sx={{
                                                    bgcolor: isDarkTheme
                                                        ? 'rgba(255, 255, 255, 0.05)'
                                                        : 'rgba(0, 0, 0, 0.05)',
                                                    color: isDarkTheme ? '#fff' : 'rgba(0, 0, 0, 0.87)',
                                                    fontWeight: 700,
                                                    fontSize: '0.85rem',
                                                    lineHeight: '32px',
                                                    paddingLeft: '16px',
                                                    paddingRight: '16px',
                                                    borderBottom: `1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                                                    position: 'sticky',
                                                    top: 0,
                                                    zIndex: 1,
                                                }}
                                            >
                                                {label}
                                            </ListSubheader>
                                            {items.map((it) => (
                                                <HistoryItem
                                                    key={it.id}
                                                    item={it}
                                                    isSelected={selectedItemId === it.id}
                                                    onSelect={handleItemClick}
                                                    onHover={handleItemHover}
                                                    onTitleChange={handleTitleChange}
                                                    onTagsChange={handleTagsChange}
                                                    onPinToggle={handlePinToggle}
                                                    fullCode={fullCodeCache[it.id]}
                                                    isDarkTheme={isDarkTheme}
                                                />
                                            ))}
                                        </ul>
                                    </li>
                                ) : null
                            )}

                            {/* Sentinel element for Intersection Observer */}
                            {!debouncedSearchQuery && !showPinnedOnly && hasMoreData && (
                                <div
                                    ref={loadMoreRef}
                                    style={{
                                        height: '20px',
                                        width: '100%',
                                        backgroundColor: isDarkTheme
                                            ? 'rgba(253, 251, 251, 0.1)'
                                            : 'rgba(253, 253, 253, 0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '10px',
                                        color: isDarkTheme ? '#666' : '#999',
                                    }}
                                >
                                    Loading...
                                </div>
                            )}

                            {loading && page > 1 && !debouncedSearchQuery && !showPinnedOnly && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 16,
                                        gap: 8,
                                    }}
                                >
                                    <CircularProgress size={20} sx={{ color: isDarkTheme ? '#fff' : undefined }} />
                                    <span
                                        style={{
                                            fontSize: '0.75rem',
                                            color: isDarkTheme ? '#aaa' : '#666',
                                        }}
                                    >
                                        Loading more history...
                                    </span>
                                </div>
                            )}
                            {!loading &&
                                !hasMoreData &&
                                data.length > 0 &&
                                !debouncedSearchQuery &&
                                !showPinnedOnly && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            padding: 16,
                                            fontSize: '0.75rem',
                                            color: isDarkTheme ? '#666' : '#999',
                                        }}
                                    >
                                        No more history to load
                                    </div>
                                )}
                            {!loading && Object.values(groups).every((arr) => arr.length === 0) && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 32,
                                        gap: 8,
                                        color: isDarkTheme ? '#666' : '#999',
                                    }}
                                >
                                    <span style={{ fontSize: '1rem' }}>📭</span>
                                    <span style={{ fontSize: '0.875rem' }}>
                                        {debouncedSearchQuery
                                            ? 'No results found'
                                            : showPinnedOnly
                                              ? 'No pinned items yet'
                                              : 'No history yet'}
                                    </span>
                                </div>
                            )}
                        </List>
                    )}

                    {/* Sticky Footer (for non-logged-in users) */}
                    {!isLoggedIn && (
                        <div
                            style={{
                                padding: '8px 12px',
                                backgroundColor: isDarkTheme ? '#5d3a1a' : '#fff3e0',
                                borderTop: `1px solid ${isDarkTheme ? '#ff9800' : '#ffb74d'}`,
                                fontSize: '0.75rem',
                                color: isDarkTheme ? '#ffb74d' : '#e65100',
                                textAlign: 'center',
                                position: 'sticky',
                                bottom: 0,
                                zIndex: 1,
                            }}
                        >
                            Session-based history will be lost when you close the browser. Login to save your history
                            permanently.
                        </div>
                    )}
                </div>
            </div>
        </Drawer>
    );
};

export default HistoryDrawer;
