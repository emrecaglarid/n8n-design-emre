/**
 * AI Trust prototype: shared vocabulary for the combined surface·destination
 * control. The surface is which chrome renders an output; the notch is how
 * real the destination is.
 */
export type PreviewSurface = 'slack' | 'email' | 'chat';
export type DestinationNotch = 'simulated' | 'draft' | 'live';

/**
 * Where an output goes: nowhere (preview), a defused test channel, or live.
 * Live is a state the agent earns, never an option that can be picked here.
 */
export type PreviewDestination =
	| { kind: 'preview' }
	| { kind: 'test'; channel: string; private?: boolean };

export interface TestChannelOption {
	channel: string;
	private?: boolean;
}

export function destinationLabel(destination: PreviewDestination): string {
	if (destination.kind === 'preview') return 'Preview';
	return `${destination.private ? '🔒' : '#'} ${destination.channel}`;
}
