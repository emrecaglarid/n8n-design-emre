/**
 * AI Trust prototype: shared vocabulary for the combined surface·destination
 * control. The surface is which chrome renders an output; the notch is how
 * real the destination is.
 */
export type PreviewSurface = 'slack' | 'email' | 'chat';
export type DestinationNotch = 'simulated' | 'draft' | 'live';
