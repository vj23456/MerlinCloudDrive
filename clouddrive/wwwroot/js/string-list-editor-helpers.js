// String List Editor Helper Functions
window.stringListEditorHelpers = {
    // Prevent default behavior and maintain focus
    handleButtonMouseDown: function(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    },
    
    // Focus an input element
    focusInput: function(inputElement) {
        if (inputElement) {
            inputElement.focus();
        }
    }
};
