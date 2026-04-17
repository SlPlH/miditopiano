import { defineConfig } from 'vite';

// GitHub Pages repo adı — değiştirmek gerekirse buradan değiştir
const REPO_NAME = 'miditopiano';

export default defineConfig({
    base: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : './',
});
