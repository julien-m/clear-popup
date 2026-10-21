import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:30000,globalTimeout:240000,expect:{timeout:3000},workers:1,retries:0,reporter:[['list']],use:{actionTimeout:5000,trace:'retain-on-failure'}});
