import { createThemePlugin } from '@vuetify/v0';

export const watchBliveTheme = createThemePlugin({
  default: 'blive-dark',
  themes: {
    'blive-dark': {
      dark: true,
      colors: {
        background: '#171819',
        foreground: '#eeeeef',
        'on-background': '#eeeeef',
        card: '#222324',
        'card-foreground': '#eeeeef',
        popover: '#27282a',
        'popover-foreground': '#eeeeef',
        primary: '#fb7299',
        'primary-foreground': '#201217',
        secondary: '#303134',
        'secondary-foreground': '#e4e4e7',
        muted: '#292a2c',
        'muted-foreground': '#8a8a91',
        accent: '#343538',
        'accent-foreground': '#fafafa',
        destructive: '#f05b67',
        border: 'rgb(255 255 255 / 9%)',
        input: 'rgb(255 255 255 / 12%)',
        ring: '#fb7299',
        'title-bar': '#1c1d1e',
        'live-surface': '#0b0c0e',
      },
    },
  },
});
