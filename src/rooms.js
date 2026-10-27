export function roomTitle(room) {
  return (
    room
      .replace(/-[a-f0-9]{12}$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/^./, (value) => value.toUpperCase()) || 'Meet Hub room'
  );
}
