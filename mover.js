const ATTRIB_NAME_START_X = "start_x";
const ATTRIB_NAME_START_Y = "start_y";
const ATTRIB_NAME_Z = "z_offset";
const ATTRIB_NAME_REL_X = "rel_x";
const ATTRIB_NAME_REL_Y = "rel_y";
const ATTRIB_NAME_MAX_SCROLL_X = "max_scroll_x";
const ATTRIB_NAME_MAX_SCROLL_Y = "max_scroll_y";
const ATTRIB_NAME_BLUR_THRESHOLD_Z = "blur_threshold_z";
const ATTRIB_NAME_BLUR_FACTOR = "blur_factor";
const ATTRIB_NAME_SCALE_ON_HOVER = "scale_on_hover";
const JQUERY_CLASS_MOVEABLE = ".moveable";
const JQUERY_CLASS_MOVEABLE_CAPTION = ".moveable_caption";

const PSUEDO_FPS = 240;
const FRAME_DURATION_MS = 1000 / PSUEDO_FPS; // 240 "FPS"

const CAMERA_MAX_TRAVEL_PER_FRAME = 1.5 / PSUEDO_FPS;
const EASE_FACTOR = 0.3;
const DEAD_ZONE = 0.02 / PSUEDO_FPS;

// All non-polar coordinates are relative to viewport size.
// Eg: from the center to either edge of the parent container is considered distance 1.
// 	   (-1, 0) would represent the center of the left edge of the parent container.
//	   (0, -1) would represent the center of the top edge of the parent container.
// 	   (1, 0) would represent the center of the right edge of the parent container.
//	   (0, 1) would represent the center of the bottom edge of the parent container.
// All relative, non-polar coordinates follow this and are in camera viewport space
// except the the camera and moveable start coordinates (x and y), which are in virtual "world"
// coordinate space.
// All polar coordinates are in camera space (with the camera at the origin).
class ParallaxContainer {

	/**
	 * container_element: The parent container for the moving elements. Should have the "parent_container" css class.
	 * horizontal_camera_fov_degrees: The horizontal field-of-view of the virtual camera.
	 */
	constructor(container_element, horizontal_camera_fov_degrees=100) {
		this.container = container_element;
		this.camera_fov = this.get_camera_fov_radians(horizontal_camera_fov_degrees);
		
		this.moveables = [...$(this.container).find(JQUERY_CLASS_MOVEABLE)].map(element => new Moveable(element, this.container));

		// In world space
		this.camera_x = 0.0;
		this.camera_y = 0.0;
		this.target_camera_x = this.camera_x;
		this.target_camera_y = this.camera_y;

		this.animation_timer = null;
		
		this.initialize_movables();
	}

	/**
	 * Computes the horizontal and vertical field-of-views of the camera based on the specified horizontal field-of-view and
	 * the aspect ratio of the container element
	 */
	get_camera_fov_radians(horizontal_camera_fov_degrees) {
		return {
			horizontal: radians(horizontal_camera_fov_degrees),
			vertical: radians(horizontal_camera_fov_degrees * this.container.offsetHeight / this.container.offsetWidth),
		};
	}

	/** Sets all moveables in their initial positions based on their attribute-based starting positions */
	initialize_movables() {
		let sorted_moveables = [];
		for (const moveable of this.moveables) {
			// In world space
			const initial_position = moveable.get_relative_start_position();
			// In camera space.
			const initial_azumith = Math.atan((initial_position.rel_x - this.camera_x) / initial_position.z_offset);
			const initial_altitude = Math.atan((initial_position.rel_y - this.camera_y) / initial_position.z_offset);

			this.set_moveable_position_polar(moveable, {azumith: initial_azumith, altitude: initial_altitude});
			sorted_moveables.push({moveable, z_offset: initial_position.z_offset});
		}
		sorted_moveables.sort((item1, item2) => item2.z_offset - item1.z_offset);
		for (let i = 0; i < sorted_moveables.length; i++) {
			sorted_moveables[i].moveable.set_z_index(i + 1);
		}
	}

	/** Returns whether the animation is currently active. */
	is_running() {
		return this.animation_timer !== null;
	}

	/** Pauses the animation loop. */
	pause() {
		clearInterval(this.animation_timer);
		this.animation_timer = null;
	}

	/** Resumes the animation loop. */
	resume() {
		if (this.animation_timer !== null) {
			return;
		}
		this.animation_timer = setInterval(() => this.perform_animation_step(), FRAME_DURATION_MS);
	}

	/**
	 * Moves the virtual camera to a position and re-renders all moveables
	 * (by adjusting their position accordingly).
	 * x: the new x-position of the camera, in world space.
	 * y: the new y-position of the camera, in world space.
	 */
	move_camera_to(x, y) {
		this.camera_x = x;
		this.camera_y = y;

		for (const moveable of this.moveables) {
			// In world space
			const prev_position = moveable.get_relative_position();
			const start_position = moveable.get_relative_start_position();

			// In camera space
			const new_azimuth = Math.atan((start_position.rel_x - this.camera_x) / start_position.z_offset);
			const new_altitude = Math.atan((start_position.rel_y - this.camera_y) / start_position.z_offset);
			this.set_moveable_position_polar(moveable, {azumith: new_azimuth, altitude: new_altitude});
		}
	}

	/**
	 * Performs one frame of the animation, "moving" the virtual camera a portion of the way to
	 * the target position.
	 */
	perform_animation_step() {
		// In world space

		// CHANGE THIS TO MODIFY ANIMATION EASING BEHAVIOR
		let camera_delta_x = (this.target_camera_x - this.camera_x) / EASE_FACTOR * FRAME_DURATION_MS * 0.001;
		let camera_delta_y = (this.target_camera_y - this.camera_y) / EASE_FACTOR * FRAME_DURATION_MS * 0.001;

		const camera_delta_distance = Math.sqrt(camera_delta_x ** 2 + camera_delta_y ** 2);
		if (camera_delta_distance > CAMERA_MAX_TRAVEL_PER_FRAME) {
			const slow_factor = CAMERA_MAX_TRAVEL_PER_FRAME / camera_delta_distance;
			camera_delta_x *= slow_factor;
			camera_delta_y *= slow_factor;
		} else if (camera_delta_distance < DEAD_ZONE) {
			return;
		}

		this.move_camera_to(this.camera_x + camera_delta_x, this.camera_y + camera_delta_y)
	}

	/** 
	 * Sets the target position the camera will ease to.
	 * x: the target x-position of the camera, in world space.
	 * y: the target y-position of the camera, in world space.
	 */
	set_target_camera_position(x, y) {
		this.target_camera_x = x;
		this.target_camera_y = y;
	}

	/**
	 * Sets the "virtual" polar coordinates of the moveable in camera space.
	 * moveable: the moveable to get the position for.
	 * relative_polar_position: {azumith: number, altitude: number} The target coordinates of
	 * 			the moveable in the camera's viewport (the container) space.
	 */
	set_moveable_position_polar(moveable, relative_polar_position) {
		const virtual_z = 1 ;
		const rel_x = Math.tan(relative_polar_position.azumith) / Math.tan(this.camera_fov.horizontal / 2);
		const rel_y = Math.tan(relative_polar_position.altitude) / Math.tan(this.camera_fov.vertical / 2);
		moveable.set_relative_position({rel_x, rel_y});
	}

	/**
	 * Sets the "virtual" polar coordinates of the moveable in camera space.
	 * moveable: the moveable to set the position for.
	 * @return {azumith: number, altitude: number}
	 */
	get_moveable_position_polar(moveable) {
		const position = moveable.get_relative_position();
		return {
			azumith: position.rel_x - 0.5 * this.camera_fov.horizontal,
			altitude: position.rel_y - 0.5 * this.camera_fov.vertical,
		}
	}

	/** Returns the parent container element of this parallax container. */
	get_enclosing_element() {
		return this.container;
	}
}

class Moveable {

	constructor (element, parent_container) {
		this.element = element;
		this.container = parent_container;
		this.blur_threshold = parseFloat(this.container.getAttribute(ATTRIB_NAME_BLUR_THRESHOLD_Z));
		this.blur_factor = parseFloat(this.container.getAttribute(ATTRIB_NAME_BLUR_FACTOR));
		this.scale_on_hover = this.container.getAttribute(ATTRIB_NAME_SCALE_ON_HOVER) === 'true';

		this.initialize_z_offset();
	}

	/** Sets the zIndex css property of the element represented by this moveable */
	set_z_index(z_index) {
		this.element.style.zIndex = z_index;
	}

	/**
	 * Sets the position of the element in camera viewport space.
	 * element: the element to set the position for.
	 * relative_position: {rel_x: number, rel_y: number} The new coordinates of the movable.
	 */
	set_relative_position(relative_position) {
		const style = this.element.style;
		style.left = (((relative_position.rel_x + 1) / 2 - (this.element.offsetWidth / this.container.offsetWidth) / 2) * 100).toString() + "%";
		style.top = (((relative_position.rel_y + 1) / 2 - (this.element.offsetHeight / this.container.offsetHeight) / 2) * 100).toString() + "%"
		this.element.setAttribute(ATTRIB_NAME_REL_X, relative_position.rel_x);
		this.element.setAttribute(ATTRIB_NAME_REL_Y, relative_position.rel_y);
	}

	/**
	 * Gets the relative position of the movable.
	 * @return {rel_x: number, rel_y: number}
	 */
	get_relative_position() {
		return {
			rel_x: parseFloat(this.element.getAttribute(ATTRIB_NAME_REL_X)),
			rel_y: parseFloat(this.element.getAttribute(ATTRIB_NAME_REL_Y)),
			z_offset: parseFloat(this.element.getAttribute(ATTRIB_NAME_Z)),
		};
	}

	/**
	 * Gets the starting position of the moveable.
	 * @return {rel_x: number, rel_y: number}
	 */
	get_relative_start_position() {
		return {
			rel_x: parseFloat(this.element.getAttribute(ATTRIB_NAME_START_X)),
			rel_y: parseFloat(this.element.getAttribute(ATTRIB_NAME_START_Y)),
			z_offset: parseFloat(this.element.getAttribute(ATTRIB_NAME_Z)),
		};
	}

	/** 
	 * Sets the image enclosed by the moveable to a percentage of its original size.
	 * Centers caption accordingly.
	 * Applies blur proportioal to z_offset for z_offsets above blur threshold.
	 */
	initialize_z_offset() {
		const start_position = this.get_relative_start_position();
		const scale_factor = 1 / Math.sqrt(start_position.z_offset);
		const hover_scale_factor = Math.sqrt(scale_factor);

		const blur_amount = start_position.z_offset >= this.blur_threshold ? (start_position.z_offset - this.blur_threshold) * this.blur_factor : 0;
		const blur_filter_string = `blur(${blur_amount}em)`;

		const original_scale_string = `scale(${scale_factor}, ${scale_factor})`;
		this.element.style.transform = original_scale_string;

		this.element.style.filter = blur_filter_string;
		$(this.element).hover(
			() => {
				this.element.style.filter = '';
				if (this.scale_on_hover) {
					this.element.style.transform = `scale(${hover_scale_factor}, ${hover_scale_factor})`;
				}
			},
			() => {
				this.element.style.filter = blur_filter_string;
				if (this.scale_on_hover) {
					this.element.style.transform = original_scale_string;
				}
			});
	}
}

class MouseCameraController {

	constructor(parallax_container) {
		this.parallax_container = parallax_container;
		this.container_element = this.parallax_container.get_enclosing_element();

		this.container_offset = this.container_element.getBoundingClientRect();
		// In world space
		this.max_x = parseFloat(this.container_element.getAttribute(ATTRIB_NAME_MAX_SCROLL_X));
		this.max_y = parseFloat(this.container_element.getAttribute(ATTRIB_NAME_MAX_SCROLL_Y));

		this.setup_mouse_listeners();
	}

	setup_mouse_listeners() {
		// this.parallax_container.get_enclosing_element().addEventListener('mouseenter', e => this.resume());
		this.container_element.addEventListener('mousemove', e => this.on_mouse_move(e));
		// this.parallax_container.get_enclosing_element().addEventListener('mouseleave', e => this.pause());
	}

	on_mouse_move(mouse_event) {
		// In viewport absolute space (pixels).
		const mouse_x_absolute = mouse_event.pageX - this.container_offset.left;
		const mouse_y_absolute = mouse_event.pageY - this.container_offset.top;
		// In viewport space.
		const mouse_x_relative = (mouse_x_absolute / this.container_element.offsetWidth - 0.5) * 2;
		const mouse_y_relative = (mouse_y_absolute / this.container_element.offsetHeight - 0.5) * 2;
		// In world space
		this.parallax_container.set_target_camera_position(
			mouse_x_relative * this.max_x,
			mouse_y_relative * this.max_y);
	}
}

function radians(degrees) {
	return degrees * Math.PI / 180;
}