// Chart.js integration for performance monitoring

// Chart variables
let performanceChart = null;
let miniPerformanceChart = null;
window.performanceChart = null; // Make it globally accessible

// Utility function for formatting bytes per second
window.formatBytesPerSecond = function(bytesPerSecond) {
    if (bytesPerSecond >= 1024 * 1024 * 1024) {
        return (bytesPerSecond / (1024 * 1024 * 1024)).toFixed(1) + ' GB/s';
    } else if (bytesPerSecond >= 1024 * 1024) {
        return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
    } else if (bytesPerSecond >= 1024) {
        return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
    } else {
        return bytesPerSecond.toFixed(1) + ' B/s';
    }
};

// Main performance chart initialization
window.initializePerformanceChart = function(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[Chart] Canvas not found:', canvasId);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[Chart] Could not get 2D context from canvas');
        return;
    }
    
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
        console.error('[Chart] Chart.js is not loaded');
        return;
    }
    
    // Destroy existing chart if exists
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    // Ensure memory dataset has correct yAxisID - same as CPU for combined percentage scale
    if (chartData.datasets && chartData.datasets.length > 1) {
        chartData.datasets[1].yAxisID = 'y'; // Use same y-axis as CPU
    }
    
    try {
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false // We have custom legend
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    if (context.datasetIndex === 0 || context.datasetIndex === 1) {
                                        // CPU and Memory percentages
                                        label += context.parsed.y.toFixed(1) + '%';
                                    } else {
                                        // Download/Upload speeds in MB/s
                                        label += context.parsed.y.toFixed(2) + ' MB/s';
                                    }
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#666',
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        min: 0,
                        max: 100,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#666',
                            callback: function(value) {
                                return value + '%';
                            }
                        },
                        title: {
                            display: true,
                            text: 'CPU/Memory Usage (%)',
                            color: '#666'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        min: 0,
                        grid: {
                            drawOnChartArea: false,
                        },
                        ticks: {
                            color: '#666',
                            callback: function(value) {
                                return value.toFixed(1) + ' MB/s';
                            }
                        },
                        title: {
                            display: true,
                            text: 'Network Speed (MB/s)',
                            color: '#666'
                        }
                    }
                },
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                }
            }
        });
        
        // Make chart globally accessible for debugging
        window.performanceChart = performanceChart;
        
    } catch (error) {
        console.error('[Chart] Error creating chart:', error);
    }
};

// Update performance chart with new data
window.updatePerformanceChart = function(chartData) {
    if (!performanceChart) {
        console.warn('[Chart] No chart to update');
        return;
    }
    
    try {
        // Update labels and data for all datasets
        performanceChart.data.labels = chartData.labels;
        performanceChart.data.datasets[0].data = chartData.cpuData;
        performanceChart.data.datasets[1].data = chartData.memoryData;
        
        // Update download and upload data if datasets exist
        if (performanceChart.data.datasets[2]) {
            performanceChart.data.datasets[2].data = chartData.downloadData;
        }
        if (performanceChart.data.datasets[3]) {
            performanceChart.data.datasets[3].data = chartData.uploadData;
        }
        
        // Ensure the memory dataset has the correct yAxisID - same as CPU
        if (performanceChart.data.datasets[1]) {
            performanceChart.data.datasets[1].yAxisID = 'y';
        }
        
        // Update the chart
        performanceChart.update('none'); // No animation for real-time updates
        
    } catch (error) {
        console.error('[Chart] Error updating chart:', error);
    }
};

// Destroy performance chart
window.destroyPerformanceChart = function() {
    if (performanceChart) {
        performanceChart.destroy();
        performanceChart = null;
    }
};

// Mini chart for Index page
window.initializeMiniPerformanceChart = function(canvasId, chartData) {
    
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error('[Chart] Mini chart canvas not found:', canvasId);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if exists
    if (miniPerformanceChart) {
        miniPerformanceChart.destroy();
    }
    
    // Check if canvas has reasonable dimensions, but don't force large sizes
    if (canvas.clientWidth < 50 || canvas.clientHeight < 30) {
        console.warn('[Chart] Canvas dimensions very small:', canvas.clientWidth, 'x', canvas.clientHeight);
        // Let the canvas be small but functional
        canvas.style.minHeight = '50px';
    }
    
    try {
        miniPerformanceChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false // Disable tooltip for mini chart
                    }
                },
                scales: {
                    x: {
                        display: false // Hide x-axis for mini chart
                    },
                    y: {
                        display: false, // Hide y-axis for mini chart
                        min: 0,
                        max: 100, // Fixed scale for percentages
                        beginAtZero: true,
                        position: 'left'
                    },
                    y1: {
                        display: false, // Hide y1-axis for mini chart
                        type: 'linear',
                        position: 'right',
                        min: 0,
                        beginAtZero: true
                    }
                },
                elements: {
                    point: {
                        radius: 0 // Hide points for clean look
                    },
                    line: {
                        borderWidth: 2,
                        tension: 0.4
                    }
                },
                animation: {
                    duration: 0 // No animation for mini chart
                }
            }
        });
    
    window.miniPerformanceChart = miniPerformanceChart; // Make globally accessible for debugging
    
    } catch (error) {
        console.error('[Chart] Error creating mini chart:', error);
    }
};

// Update mini performance chart
window.updateMiniPerformanceChart = function(chartData) {
    if (!miniPerformanceChart) {
        // Try to initialize if chart doesn't exist
        const canvas = document.getElementById('indexPerformanceChart');
        if (canvas) {
            const initialData = {
                labels: chartData.labels,
                datasets: [{
                    label: 'CPU Usage (%)',
                    data: chartData.cpuData,
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                }, {
                    label: 'Memory Usage (%)',
                    data: chartData.memoryData,
                    borderColor: '#9c27b0',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                }, {
                    label: 'Download Speed (MB/s)',
                    data: chartData.downloadData,
                    borderColor: '#2196f3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }, {
                    label: 'Upload Speed (MB/s)',
                    data: chartData.uploadData,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    fill: false,
                    tension: 0.4,
                    yAxisID: 'y1'
                }]
            };
            window.initializeMiniPerformanceChart('indexPerformanceChart', initialData);
        }
        return;
    }
    
    try {
        // Update all 4 datasets for mini chart with immediate update
        miniPerformanceChart.data.labels = chartData.labels;
        miniPerformanceChart.data.datasets[0].data = chartData.cpuData;
        if (miniPerformanceChart.data.datasets[1]) {
            miniPerformanceChart.data.datasets[1].data = chartData.memoryData;
        }
        if (miniPerformanceChart.data.datasets[2]) {
            miniPerformanceChart.data.datasets[2].data = chartData.downloadData;
        }
        if (miniPerformanceChart.data.datasets[3]) {
            miniPerformanceChart.data.datasets[3].data = chartData.uploadData;
        }
        
        // Use 'none' for instant updates without animation
        miniPerformanceChart.update('none');
    } catch (error) {
        console.error('[Chart] Error updating mini chart:', error);
    }
};
