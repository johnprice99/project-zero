import { mount } from 'svelte';
import App from './App.svelte';
import './theme.css';
import './styles.css';
import { applyTheme, readTheme } from './lib/theme';
applyTheme(readTheme());
mount(App, { target: document.getElementById('app')! });
