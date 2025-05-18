// Text styles
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const italic = '\x1b[3m';
const underline = '\x1b[4m';

// Text colors
const black = '\x1b[30m';
const red = '\x1b[31m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const magenta = '\x1b[35m';
const cyan = '\x1b[36m';
const white = '\x1b[37m';

// Background colors
const bgBlack = '\x1b[40m';
const bgRed = '\x1b[41m';
const bgGreen = '\x1b[42m';
const bgYellow = '\x1b[43m';
const bgBlue = '\x1b[44m';
const bgMagenta = '\x1b[45m';
const bgCyan = '\x1b[46m';
const bgWhite = '\x1b[47m';

// Utility functions
export const consoleStyles = {
    // Text styles
    reset,
    bold,
    dim,
    italic,
    underline,
    
    // Colors
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    
    // Backgrounds
    bgBlack,
    bgRed,
    bgGreen,
    bgYellow,
    bgBlue,
    bgMagenta,
    bgCyan,
    bgWhite,
    
    // Predefined styles
    success: (text: string) => `${green}${bold}${text}${reset}`,
    error: (text: string) => `${red}${bold}${text}${reset}`,
    warning: (text: string) => `${yellow}${bold}${text}${reset}`,
    info: (text: string) => `${blue}${bold}${text}${reset}`,
    highlight: (text: string) => `${cyan}${bold}${text}${reset}`,
    
    // Project-specific styles
    project: (name: string) => `${magenta}${bold}${name}${reset}`,
    successProject: (name: string) => `${green}${bold}${name}${reset}`,
    skippedProject: (name: string) => `${dim}${name}${reset}`,
    errorProject: (name: string) => `${red}${bold}${name}${reset}`,
};
