import React, { useState, useEffect, useRef } from 'react';
import _debounce from 'lodash/debounce';
import { PiPushPinFill, PiPushPinSlashFill } from "react-icons/pi";
import { MdRefresh, MdOutlineSearch } from "react-icons/md";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  Typography,
  Divider,
  IconButton,
  InputAdornment, Input
} from '@mui/material';
import { getHistoryByPage, searchUserHistory, getCodeById } from '../../api/playgroundApi';
import '../../assets/style/Drawer.css';
import '../../assets/style/Playground.css';

/**
 * Display a drawer with the user's history. 
 * @param {*} isOpen - The state of the drawer
 * @param {*} onClose - The callback function to close the drawer
 * @param {*} onItemSelect - The callback function to select an item from the drawer
 * @returns 
 */
const DrawerComponent = ({ isOpen, onClose, onItemSelect }) => {
  const [data, setData] = useState([]); // contains the user history 
  const [page, setPage] = useState(1); // contains the current page number for history pagination
  const [loading, setLoading] = useState(false); // contains the loading state for history pagination
  const [pinned, setPinned] = useState(false); // contains the pinned state for the drawer
  const [hasMoreData, setHasMoreData] = useState(true); // contains the state for checking if there's more data to fetch
  const [searchData, setSearchData] = useState([]); // contains the search data
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); // contains the debounced search query
  const [selectedItemId, setSelectedItemId] = useState(null); // contains the selected item id. This is used to highlight the selected item of the history
  const drawerRef = useRef(null);

  /**
   * Fetches the user history from the API. 
   * If the page number is 1, it will set the data to the fetched data. Otherwise, it will append the data to the existing data.
   * hasMoreData is used to check if there's more data to fetch.
   * @param {number} pageNumber - The page number to fetch
   * @returns {void}
   */
  const fetchData = async (pageNumber) => {
    if (loading || !hasMoreData) {
      return;
    }

    try {
      setLoading(true);
      const res = await getHistoryByPage(pageNumber);
      if (pageNumber === 1) {
        setData(res.history);
      } else {
        setData((prevData) => [...prevData, ...res.history]);
      }
      setHasMoreData(res.has_more_data);
      // Update the page after setting the data
      setPage((prevPage) => prevPage + 1);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches the user history with search query from the API with debounce.
   * @param {string} query - The search query
   * @todo Add pagination for search results if needed
   * @returns {void}
  */
  const debouncedSearchDataFetch = _debounce(async (query, pageNumber) => {
    if (query.length < 1) {
      // clean the search data if the query is less than 3 characters
      setSearchData([]);
      return;
    }
    try {
      setLoading(true);
      searchUserHistory(query)
        .then((res) => {
          if (pageNumber === 1) {
            setSearchData(res.history);
          } else {
            setSearchData((prevData) => [...prevData, ...res.history]);
          }
        })
        .catch((err) => {
          console.log(err)
        })
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, 500);

  /**
   * Fetches the user history with search query from the API.
   */
  const searchDataFetch = async (pageNumber) => {
    debouncedSearchDataFetch(debouncedSearchQuery, pageNumber);
  };

  /**
   * Handles the search query change. Once the search query changes, 
   * it will call the debounced search data fetch function.
   * @param {object} event - The event object
   * @returns {void}
  */
  const handleSearchChange = (event) => {
    const newSearchQuery = event.target.value;
    setDebouncedSearchQuery(newSearchQuery);
    setPage(1);
  };

  /**
   * Handles the scroll event. If the user scrolls to the bottom of the page,
   * it will call the fetch data function to fetch the next page. 
   * @returns {void} 
  */
  const handleScroll = () => {
    if (drawerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = drawerRef.current;

      // Calculate the distance from the bottom of the scroll
      const scrollBottom = scrollHeight - (scrollTop + clientHeight);
      const threshold = 50;

      if (scrollBottom < threshold && !loading) {
        fetchData(page);
      }
    }
  };

  /** 
   * Handles the item click event. When the user clicks on an item on the drawer,
   * it will fetch the item content from the API and call the callback function
   * with the code.
   * @param {number} itemId - The item id (Data table id)
   * @param {string} permalink - The item permalink (Data table permalink)
   * @param {string} check - The check name (Check type: Limboole, NuXmv, etc.)
   * @returns {void}
   * @todo Add error handling
  */
  const handleItemClick = async (itemId, check) => {
    try {
      await getCodeById(itemId)
        .then((res) => {
          const itemContent = res;
          onItemSelect(itemContent.check, itemContent.permalink, itemContent.code);
          onClose();
          setSelectedItemId(itemId);
        })
        .catch((err) => {
          console.log(err)
        })
    } catch (error) {
      console.error('Error fetching item content:', error);
    }
  };

  /**
   * Handles the pin toggle event. When the user clicks on the pin icon,
   * it will toggle the pinned state of the drawer.
   */
  const handlePinToggle = () => {
    setPinned(!pinned);
  };

  /**
   * Handles the refresh event. When the user clicks on the refresh icon,
   * it will fetch the first page of the user history and update the data.
   * @returns {void}
   */
  const handleRefresh = async () => {
    await getHistoryByPage(1)
      .then((res) => {
        setData((prevData) => [...res.history, ...prevData]);
      })
      .catch((err) => {
        console.log(err)
      })
  };


  /**
   * Remove duplicates from data array
   * Technically, this is not needed since the API already returns unique data.
   * But because of async nature of the API, it's possible to get duplicate data someetimes.
   * @todo Remove this if the API is updated to return unique data.
   */
  const uniqueData = (data ?? []).length > 0
    ? Array.from(new Set(data.map((item) => item.id))).map((id) => {
      return data.find((item) => item.id === id);
    })
    : [];

  /**
   * Remove duplicates from search data array
   * Technically, this is not needed since the API already returns unique data.
   * But because of async nature of the API, it's possible to get duplicate data someetimes.
   * @todo Remove this if the API is updated to return unique data.
   */
  const uniqueSearchData = (searchData ?? []).length > 0
    ? Array.from(new Set(searchData.map((item) => item.id))).map((id) => {
      return searchData.find((item) => item.id === id);
    })
    : [];


  useEffect(() => {
    if (page === 1) {
      fetchData(page);
    }
  }, [page]);

  /**
 * Adds an event listener to the window object to listen for scroll events.
 * Handle scroll event is called when the user scrolls to the bottom of the page.
 */
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    if (isOpen) {
      fetchData(page);
    }
  }, [isOpen]);

  /** 
   * Fetches the user history from the API when the search query changes.
   */
  useEffect(() => {
    searchDataFetch(page);
  }, [debouncedSearchQuery, page]);

  return (
    <Drawer
      ref={drawerRef}
      variant={pinned ? 'permanent' : 'temporary'}
      anchor="right"
      open={isOpen}
      onClose={onClose}
      ModalProps={{ disableScrollLock: true }}
      width={300}
      sx={{
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 300,
          boxSizing: 'border-box',
          overflowX: 'hidden',
        },
      }}
    >
      <div style={{ overflow: 'auto' }}>
        <List
          sx={{
            maxHeight: '100%',
            overflowY: 'auto',
          }}
          onScroll={handleScroll}
        >
          <ListItem className='d-flex justify-content-between mx-auto'>
            <Typography variant="h5">History</Typography>
            <div className='d-flex align-items-center'>
              {debouncedSearchQuery
                ? ''
                : <IconButton onClick={handleRefresh}>
                  <MdRefresh className='playground-icon' />
                </IconButton>
              }
              <IconButton onClick={handlePinToggle}>
                {pinned ? <PiPushPinFill className='playground-icon' /> : <PiPushPinSlashFill className='playground-icon' />}
              </IconButton>
            </div>
          </ListItem>
          <ListItem>
            <Input
              type="text"
              placeholder="Search"
              onChange={handleSearchChange}
              fullWidth
              startAdornment={
                <InputAdornment position="start">
                  <IconButton>
                    <MdOutlineSearch className='playground-icon' />
                  </IconButton>
                </InputAdornment>
              }
            />
          </ListItem>
          {debouncedSearchQuery
            ? uniqueSearchData
              .map((item, index) => (
                <React.Fragment key={item.id}>
                  <ListItem disablePadding>
                    <ListItemButton
                      selected={selectedItemId === item.id}
                      onClick={() => handleItemClick(item.id, item.check)}>
                      <div>
                        <Typography variant="subtitle1">
                          {item.time} - <span style={{ color: 'gray' }}>{item.check}</span>
                        </Typography>
                        <Typography variant="subtitle1"> <code>{item.code}</code></Typography>
                      </div>
                    </ListItemButton>
                  </ListItem>
                  {index < data.length - 1 && <Divider />}
                </React.Fragment>
              ))
            : uniqueData.map((item, index) => (
              <React.Fragment key={item.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    selected={selectedItemId === item.id}
                    onClick={() => handleItemClick(item.id, item.check)}>
                    <div>
                      <Typography variant="subtitle1">
                        {item.time} - <span style={{ color: 'gray' }}>{item.check}</span>
                      </Typography>

                      <Typography variant="subtitle1"> <code>{item.code}</code></Typography>
                    </div>
                  </ListItemButton>
                </ListItem>
                {index < data.length - 1 && <Divider />}
              </React.Fragment>
            ))}

        </List>
      </div>
    </Drawer>
  );
};

export default DrawerComponent;
