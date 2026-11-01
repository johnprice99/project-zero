import { mount } from 'svelte';
import App from './App.svelte';
import './theme.css';
import './styles.css';
import { applyTheme, readTheme } from './lib/theme';
import { createAppStore, openBoard } from './lib/native';
applyTheme(readTheme());
const store = createAppStore();
void openBoard(store).then(startup => mount(App, { target: document.getElementById('app')!, props: { store, startup } }));
