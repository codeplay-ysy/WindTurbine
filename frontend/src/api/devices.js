export async function fetchDeviceTopology() {
  return Promise.resolve([
    {
      windFarm: '风场A区',
      turbines: [
        { id: 'WT-001', blades: ['Blade-A', 'Blade-B', 'Blade-C'] },
        { id: 'WT-002', blades: ['Blade-A', 'Blade-B', 'Blade-C'] },
      ],
    },
    {
      windFarm: '风场B区',
      turbines: [
        { id: 'WT-101', blades: ['Blade-A', 'Blade-B', 'Blade-C'] },
        { id: 'WT-102', blades: ['Blade-A', 'Blade-B', 'Blade-C'] },
      ],
    },
  ])
}
