// builds one stylesheet per page: css/src/<page>.css -> css/<page>.css.
// each page only scans its own html + scripts, and keeps its own .inp/.lbl/.btn-* look.
// run `npm run build` after adding or changing tailwind classes; the output is committed so deploys need no build step
const { execFileSync } = require('child_process');
const path = require('path');

const CLI = require.resolve('tailwindcss/lib/cli.js');
const PAGES = {
    index: [],
    pasien: ['js/pages/pasien.js'],
    pendonor: ['js/pages/pendonor.js'],
    kartu: ['js/pages/kartu.js'],
    faskes: ['js/pages/faskes.js'],
    admin: ['js/pages/admin.js'],
};

for (const [page, scripts] of Object.entries(PAGES)) {
    const content = [`./${page}.html`, './js/store.js', './js/ui.js', ...scripts.map(s => './' + s)].join(',');
    execFileSync(process.execPath, [CLI, '-c', 'tailwind.config.js', '-i', `css/src/${page}.css`, '-o', `css/${page}.css`, '--content', content, '--minify'], {
        cwd: __dirname,
        env: { ...process.env, BROWSERSLIST_IGNORE_OLD_DATA: '1' },
        stdio: 'ignore',
    });
    console.log(`css/${page}.css`);
}
