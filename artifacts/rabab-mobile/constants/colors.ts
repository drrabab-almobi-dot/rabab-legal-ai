/**
 * RABAB LEGAL brand palette — dark navy + gold.
 * Derived from the sibling web artifact (artifacts/rabab-legal/src/index.css).
 *
 * The brand is dark-only, so light and dark share the same values.
 */
const colors = {
  light: {
    // Legacy aliases
    text: '#F5F5F5',
    tint: '#F5C000',

    // Core surfaces
    background: '#091120',
    foreground: '#F5F5F5',

    // Cards / elevated surfaces
    card: '#0D172B',
    cardForeground: '#F5F5F5',

    // Primary action — brand gold
    primary: '#F5C000',
    primaryForeground: '#091120',

    // Secondary — electric cyan
    secondary: '#00D4FF',
    secondaryForeground: '#091120',

    // Muted surfaces
    muted: '#141E34',
    mutedForeground: '#8A9FC0',

    // Accent — neon violet
    accent: '#8B5CF6',
    accentForeground: '#FFFFFF',

    // Destructive
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',

    // Borders and inputs
    border: '#1A4A5C',
    input: '#141E34',
  },

  dark: {
    text: '#F5F5F5',
    tint: '#F5C000',
    background: '#091120',
    foreground: '#F5F5F5',
    card: '#0D172B',
    cardForeground: '#F5F5F5',
    primary: '#F5C000',
    primaryForeground: '#091120',
    secondary: '#00D4FF',
    secondaryForeground: '#091120',
    muted: '#141E34',
    mutedForeground: '#8A9FC0',
    accent: '#8B5CF6',
    accentForeground: '#FFFFFF',
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',
    border: '#1A4A5C',
    input: '#141E34',
  },

  // Border radius matching the web app's --radius: 0.5rem = 8px
  radius: 12,
};

export default colors;
