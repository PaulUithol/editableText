/**
 * editableText plugin that uses contentEditable property (FF2 is not supported)
 * Project page - https://github.com/PaulUithol/editableText
 * 
 * Supports the 'PageDown' JS parser for markdown; see http://code.google.com/p/pagedown/ .
 * 
 * 
 * Forked from http://github.com/valums/editableText, copyright (c) 2009 Andris Valums, http://valums.com
 * Licensed under the MIT license (http://valums.com/mit-license/)
 */
(function( $, undefined ){
	'use strict';

	$.editableText = function() { return this.init.apply( this, arguments ); };
	
	$.editableText.prototype = {
		// Properties
		element: null,
		options: null,
		
		buttons: null,
		editButton: null,
		value: null,
		converter: null,
		useMarkdown: null,
		
		init: function( element, options ) {
			var dit = this;
			this.element = $( element );
			this.options = options;
			this.useMarkdown = options.enableMarkdown && window.Markdown && this.element.data( 'markdown' ) != null;

			// Set up a couple of proxy functions for functions that should stay bound to `this`
			this.edit = $.proxy( this.edit, this );
			this.save = $.proxy( this.save, this );
			this.cancel = $.proxy( this.cancel, this );
			this._saveOnClickOutside = $.proxy( this._saveOnClickOutside, this );
			this._handleKeydown = $.proxy( this._handleKeydown, this );
			
			//console.debug( 'element=%o, options=%o', this.element, this.options );

			// 'this.value' is stored so we can restore the previous content if editing is cancelled. Also saved
			// in saved in 'startEditing', if not using Markdown. If using Markdown, converted strings should be avoided.
			if ( this.useMarkdown ) {
				this.value = this.element.text();

				// Use 'getSanitizingConverter' if available; fall back to the regular converter.
				this.converter = Markdown.getSanitizingConverter && Markdown.getSanitizingConverter() || new Markdown.Converter();
				this._setContent( this.value );
			}
			else {
				this.value = this.element.html();
			}
			
			// Create edit/save buttons
			if ( options.showToolbar === 'after' || options.showToolbar === 'before' ) {
				this.buttons = $( '<div>', { 'class': options.toolbarClass } );

				options.showEdit && this.buttons.append( $( '<a>', { 'class': 'edit', href: '#', role: 'button', title: options.editTitle } ) );
				options.showSave && this.buttons.append( $( '<a>', { 'class': 'save', href: '#', role: 'button', title: options.saveTitle } ) );
				options.showCancel && this.buttons.append( $( '<a>', { 'class': 'cancel', href: '#', role: 'button', title: options.cancelTitle } ) );
				
				// Insert the toolbar 'after' or 'before' the chosen element
				var toolbarElem = options.insertToolbarAt && $( options.insertToolbarAt ) || this.element;
				toolbarElem[ options.showToolbar ]( this.buttons );
				
				this.buttons.css( {
					'display': this.element.css( 'display' ),
					'zIndex': ( parseInt( this.element.css( 'zIndex' ), 10 ) || 0 ) + 1
				} );
				
				options.compensateTopMargin && this.buttons.css( { 'margin-top': this.element.css( 'margin-top' ) } );
				
				// Hide buttons; display only the 'edit' button by default
				this.buttons.children().hide();
				
				// Save references and attach events
				this.editButton = this.buttons.find('.edit').click( this.edit ).show();
				this.buttons.find('.save').click( this.save );
				this.buttons.find('.cancel').click( this.cancel );
			}
			
			// Bind on 'keydown' directly so we'll be first to handle keypresses, hopefully;
			// for example, jQuery.ui.dialog closes the dialog on keydown for escape.
			this.element.keydown( this._handleKeydown );

			if ( options.editOnClick ) {
				this.element.on( 'click.editableText', this.edit );
			}
			else if ( options.editOnDblClick ) {
				this.element.on( 'dblclick.editableText', this.edit );
			}
			
			// Add the contenteditable attribute to element
			if ( this.element.attr( 'contenteditable' ) == null ) {
				this.element.attr( 'contenteditable', 'false' );
			}
			// If the element already has 'contenteditable="true"', show the appropriate (edit) state
			else if ( this.element.attr( 'contenteditable' ) === 'true' ) {
				this._startEditing();
			}
		},
		
		/**
		 * 'Edit' action
		 */
		edit: function( event ) {
			// Don't move into edit mode if a) we already are, or b) we're in single-click mode,
			// and we've clicked a link in the editable area.
			var target = $( event.target );
			if ( this.element.attr( 'contenteditable' ) === 'true' ||
					( this.options.editOnClick && target.is( 'a' ) && target.closest( this.element ).length ) ) {
				return;
			}

			this.editEvent = event;
			
			event && event.preventDefault();
			this._startEditing();
		},
		
		/**
		 * 'Save' action
		 */
		save: function( event ) {
			// Prevent the click that started editing from triggering `save` right away
			if ( this.element.attr( 'contenteditable' ) !== 'true' ||
					( this.editEvent && event && this.editEvent.originalEvent === event.originalEvent ) ) {
				return;
			}
			
			event && event.preventDefault();

			this._stopEditing();
			var prevValue = this.value;
			this.value = this.element.html();

			// For Markdown, convert line breaks (FF, Chrome) and closing div tags (Chrome) to line breaks.
			// Strip other html tags.
			this.value = this._htmlToText( this.value );

			this._setContent( this.value );
			
			$.isFunction( this.options.change ) && this.options.change.call( this.element[ 0 ], this.element, this.value, prevValue );
			this.element.trigger( 'change', [ this.value, prevValue ] );
		},
		
		/**
		 * 'Cancel' action
		 */
		cancel: function( event ) {
			// Prevent the click that started editing from triggering `cancel` right away
			if ( this.element.attr( 'contenteditable' ) !== 'true' ||
					( this.editEvent && event && this.editEvent.originalEvent === event.originalEvent ) ) {
				return;
			}
			
			event && event.preventDefault();

			this._stopEditing();
			this._setContent( this.value );
		},

		destroy: function( event ) {
			this.buttons.remove();
			this.element.removeAttr( 'contenteditable' );
			this.element.off( '.editableText' );
			this.element.removeData( '$.editableText' );
		},
		
		/**
		 * Makes element editable
		 */
		_startEditing: function() {
			if ( this.options.showToolbar ) {
				this.buttons
					.addClass( 'editing' )
					.children().show();
				
				this.editButton.hide();
			}

			if ( this.useMarkdown ) {
				// Restore the original (non-converted) Markdown from `this.value`
				var content = this.value.replace( /\n/gi, '<br>' );
				this.element.html( content );
			}
			else {
				this.value = this.element.html();
			}
			
			this.element.attr( 'contenteditable', 'true' );
			
			// Trigger callback/event
			this.element.focus();
			$.isFunction( this.options.startEditing ) && this.options.startEditing.call( this.element[ 0 ], this.element );
			this.element.trigger( 'startEditing' );

			this.options.saveOnBlur && $( document ).on( 'mousedown', this._saveOnClickOutside );
		},
		
		/**
		 * Makes element non-editable
		 */
		_stopEditing: function() {
			if ( this.options.showToolbar ) {
				this.buttons
					.removeClass( 'editing' )
					.children().hide();
				
				this.editButton.show();
			}
			
			this.element.attr( 'contenteditable', 'false' );
			this.options.saveOnBlur && $( document ).off( 'mousedown', this._saveOnClickOutside );

			// Trigger callback/event
			this.element.blur();
			$.isFunction( this.options.stopEditing ) && this.options.stopEditing.call( this.element[ 0 ], this.element );
			this.element.trigger( 'stopEditing' );
		},
		
		_setContent: function( content ) {
			// For Markdown, replace all <br> by \n.
			if ( this.useMarkdown ) {
				this.element.html( this.converter.makeHtml( content.replace( /<br>/gi, '\n' ) ) );
			}
			else {
				this.element.html( content );
			}
		},

		_handleKeydown: function( event ) {
			var dit = this;

			// Save on enter, if not allowed to add newlines
			if ( event.keyCode === $.ui.keyCode.ENTER ) {
				if ( this.options.saveOnEnter && !this.options.newlinesEnabled ) {
					event.preventDefault();

					// Defer executing the `save` until the keydown event has finished propagating.
					// Doing it earlier make (for example) a jquery menu think it doesn't have an active item when
					// it's also handling a keydown.
					setTimeout( function() {
						dit.save( event );
					}, 0 );
				}
				else if ( !this.options.newlinesEnabled ) {
					event.preventDefault();
				}
			}
			// Cancel on escape
			if ( event.keyCode === 27 ) {
				this.cancel( event );
			}
		},
		
		/**
		 * Trigger the 'save' function when the user clicks outside of both the 'editable', and outside of the 'buttons'.
		 */
		_saveOnClickOutside: function( event ) {
			var target = $( event.target );
			if ( !target.closest( this.element ).length && !target.closest( this.buttons ).length ) {
				this.save( event );
			}
		},

		_htmlToText: function( html ) {
			html = html
				// Remove line breaks
				.replace( /(?:\n|\r\n|\r)/ig, ' ' )
				// Decode HTML entities.
				.replace( /&([^;]+);/g, decodeHtmlEntity )
				// Remove content in script tags.
				.replace( /<\s*script[^>]*>[\s\S]*?<\/script>/mig, '' )
				// Remove content in style tags.
				.replace( /<\s*style[^>]*>[\s\S]*?<\/style>/mig, '' )
				// Remove content in comments.
				.replace( /<!--.*?-->/mig, '' )
				// Remove !DOCTYPE
				.replace( /<!DOCTYPE.*?>/ig, '' )
				// Convert tags that should display a line break to `\n`
				.replace( /<\s*br[^>]*\/?\s*>|<\/div>|<\/p>/gi, '\n' )
				// Strip remaining html tags
				.replace( /<(?:.|\n)*?>/gm, '' )
				// Remove whitespace at the beginning of the text.
				.replace( /^\s+/, '' )
				// Remove whitespace at the end of the text.
				.replace( /\s+$/, '' );

			return html;
		}
	};
	
	/**
	 * Usage $('selector).editableText( options );
	 * See $.fn.editableText.defaults for valid options 
	 */
    $.fn.editableText = function( options ) {
		var args = Array.prototype.slice.call( arguments, 1 );
		
		return this.each( function() {
			var instance = $.data( this, '$.editableText' );
			
			// constructor
			if ( !instance ) {
				options = $.extend( {}, $.fn.editableText.defaults, options );
				$.data( this, '$.editableText', new $.editableText( this, options ) );
			}
			// regular method
			else if ( typeof options === 'string' && options[0] !== '_' && $.isFunction( instance[ options ] ) ) {
				instance[ options ].apply( instance, args );
			}
			else {
				console && console.warn('$.editableText "%o" does not have a (public) method "%o".', instance, options );
				throw new Error('$.editableText "' + instance + '" does not have a (public) method "' + options + '".' );
			}
		});
    };
	
	$.fn.editableText.defaults = {
		/**
		 * Enable markdown if possible. If enabled, editables that have the attribute 'data-markdown'
		 * will be treated as markdown (requires showdown.js to be loaded).
		 */
		enableMarkdown: true,
		/**
		 * Pass true to enable line breaks. Useful with divs that contain paragraphs.
		 * If false, prevents user from adding newlines to headers, links, etc.
		 */
		newlinesEnabled : false,
		/**
		 * Show options for the toolbar. The toolbar can be inserted 'before' or 'after' the editable element,
		 * and can be disabled by setting this option to 'false' (bool).
		 */
		showToolbar: 'before',
		/**
		 * Class name for the toolbar
		 */
		toolbarClass: 'editableToolbar',
		/**
		 * The element relative to which the toolbar should be inserted (whether it's inserted 'before' or 'after'
		 * is determined by 'showToolbar'). Defaults to the editable element.
		 */
		insertToolbarAt: null,
		/**
		 * Show or hide for individual toolbar buttons
		 */
		showCancel: true,
		showEdit: true,
		showSave: true,
		/**
		 * Adjust the top margin for the 'editableToolbar' to the margin on the editable element.
		 * Useful for headings and such.
		 */
		compensateTopMargin: false,
		/**
		 * Titles for the 'edit', 'save' and 'cancel' buttons
		 */
		editTitle: 'Edit',
		saveTitle: 'Save',
		cancelTitle: 'Discard',
		/**
		 * Whether or not a single 'click' should trigger 'edit'.
		 */
		editOnClick: false,
		/**
		 * Whether or not 'dblclick' should trigger 'edit'.
		 */
		editOnDblClick: true,
		/**
		 * Whether or not 'blur' (focusing away from the editable, and the buttons) should trigger 'save'.
		 */
		saveOnBlur: true,
		/**
		 * Whether or not 'enter' should trigger 'save' (only when `newlineEnabled` is false)
		 */
		saveOnEnter: true,
		/**
		 * Callbacks. Fired when the value of the editable is changed, when editing is started, or when editing is stopped.
		 */
		change: null,
		startEditing: null,
		stopEditing: null
	};

	function decodeHtmlEntity( m, n ) {
		// Determine the character code of the entity. Range is 0 to 65535
		// (characters in JavaScript are Unicode, and entities can represent
		// Unicode characters).
		var code;

		// Try to parse as numeric entity. This is done before named entities for
		// speed because associative array lookup in many JavaScript implementations
		// is a linear search.
		if ( n.substr( 0, 1 ) === '#' ) {
			// Try to parse as numeric entity
			if ( n.substr( 1, 1 ) === 'x' ) {
				// Try to parse as hexadecimal
				code = parseInt( n.substr( 2 ), 16 );
			}
			else {
				// Try to parse as decimal
				code = parseInt( n.substr( 1 ), 10 );
			}
		}
		else {
			// Try to parse as named entity
			code = ENTITIES_MAP[n];
		}

		// If still nothing, pass entity through
		return ( code === undefined || isNaN( code ) ) ?
			'&' + n + ';' : String.fromCharCode(code);
	}

	var ENTITIES_MAP = {
		'nbsp': 32,
		'quot' : 34,
		'amp' : 38,
		'lt' : 60,
		'gt' : 62,
		'iexcl' : 161,
		'cent' : 162,
		'pound' : 163,
		'curren' : 164,
		'yen' : 165,
		'brvbar' : 166,
		'sect' : 167,
		'uml' : 168,
		'copy' : 169,
		'ordf' : 170,
		'laquo' : 171,
		'not' : 172,
		'shy' : 173,
		'reg' : 174,
		'macr' : 175,
		'deg' : 176,
		'plusmn' : 177,
		'sup2' : 178,
		'sup3' : 179,
		'acute' : 180,
		'micro' : 181,
		'para' : 182,
		'middot' : 183,
		'cedil' : 184,
		'sup1' : 185,
		'ordm' : 186,
		'raquo' : 187,
		'frac14' : 188,
		'frac12' : 189,
		'frac34' : 190,
		'iquest' : 191,
		'Agrave' : 192,
		'Aacute' : 193,
		'Acirc' : 194,
		'Atilde' : 195,
		'Auml' : 196,
		'Aring' : 197,
		'AElig' : 198,
		'Ccedil' : 199,
		'Egrave' : 200,
		'Eacute' : 201,
		'Ecirc' : 202,
		'Euml' : 203,
		'Igrave' : 204,
		'Iacute' : 205,
		'Icirc' : 206,
		'Iuml' : 207,
		'ETH' : 208,
		'Ntilde' : 209,
		'Ograve' : 210,
		'Oacute' : 211,
		'Ocirc' : 212,
		'Otilde' : 213,
		'Ouml' : 214,
		'times' : 215,
		'Oslash' : 216,
		'Ugrave' : 217,
		'Uacute' : 218,
		'Ucirc' : 219,
		'Uuml' : 220,
		'Yacute' : 221,
		'THORN' : 222,
		'szlig' : 223,
		'agrave' : 224,
		'aacute' : 225,
		'acirc' : 226,
		'atilde' : 227,
		'auml' : 228,
		'aring' : 229,
		'aelig' : 230,
		'ccedil' : 231,
		'egrave' : 232,
		'eacute' : 233,
		'ecirc' : 234,
		'euml' : 235,
		'igrave' : 236,
		'iacute' : 237,
		'icirc' : 238,
		'iuml' : 239,
		'eth' : 240,
		'ntilde' : 241,
		'ograve' : 242,
		'oacute' : 243,
		'ocirc' : 244,
		'otilde' : 245,
		'ouml' : 246,
		'divide' : 247,
		'oslash' : 248,
		'ugrave' : 249,
		'uacute' : 250,
		'ucirc' : 251,
		'uuml' : 252,
		'yacute' : 253,
		'thorn' : 254,
		'yuml' : 255,
		'OElig' : 338,
		'oelig' : 339,
		'Scaron' : 352,
		'scaron' : 353,
		'Yuml' : 376,
		'circ' : 710,
		'tilde' : 732,
		'ensp' : 8194,
		'emsp' : 8195,
		'thinsp' : 8201,
		'zwnj' : 8204,
		'zwj' : 8205,
		'lrm' : 8206,
		'rlm' : 8207,
		'ndash' : 8211,
		'mdash' : 8212,
		'lsquo' : 8216,
		'rsquo' : 8217,
		'sbquo' : 8218,
		'ldquo' : 8220,
		'rdquo' : 8221,
		'bdquo' : 8222,
		'dagger' : 8224,
		'Dagger' : 8225,
		'permil' : 8240,
		'lsaquo' : 8249,
		'rsaquo' : 8250,
		'euro' : 8364
	};
})( jQuery );
