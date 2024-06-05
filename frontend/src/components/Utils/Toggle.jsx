import React from 'react';
import '../../assets/style/Toggle.css';

const Toggle = ({ isDarkTheme, setIsDarkTheme }) => {
  const isDark = typeof isDarkTheme === 'string' ? JSON.parse(isDarkTheme) : isDarkTheme;
  return (
    <div className='toggle-container'>
      <input 
        type="checkbox" 
        id='check' 
        className='toggle' 
        onChange={(e) => setIsDarkTheme(e.target.checked)} 
        checked={isDark} 
      />
      <label htmlFor="check">
        <span className="icon sun-icon">☀️</span>
        <span className="icon moon-icon">🌙</span>
      </label>
    </div>
  );
}

export default Toggle;
