// SystemConfigs.razor.js
export function initializeDropdown(dropdownElement, dotNetHelper) {
    if (!dropdownElement || !dotNetHelper) {
        return;
    }

    // Function to handle clicks outside the dropdown
    function handleClickOutside(event) {
        if (!dropdownElement.contains(event.target)) {
            dotNetHelper.invokeMethodAsync('CloseDropdown');
        }
    }

    // Add event listener for clicks outside
    document.addEventListener('click', handleClickOutside);

    // Return cleanup function
    return {
        dispose: () => {
            document.removeEventListener('click', handleClickOutside);
        }
    };
}
