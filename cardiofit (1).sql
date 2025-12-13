-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 13-12-2025 a las 22:01:41
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `cardiofit`
--

DELIMITER $$
--
-- Procedimientos
--
CREATE DEFINER=`cardiofit_user`@`%` PROCEDURE `AgendarAutomatico` (IN `p_user_id` INT, IN `p_date` DATE, IN `p_time` TIME)   BEGIN
    -- Declaración de variables
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_staff_id INT;
    DECLARE v_capacity INT;
    DECLARE v_current_bookings INT;
    DECLARE v_day_of_week INT;
    DECLARE v_assigned_staff VARCHAR(100);
    DECLARE v_is_open INT DEFAULT 0; -- Nueva variable para saber si está abierto

    -- 1. CALCULAR DÍA DE LA SEMANA
    -- MySQL devuelve: 0=Lunes ... 6=Domingo. Sumamos 1 para que sea: 1=Lunes ... 7=Domingo
    SET v_day_of_week = WEEKDAY(p_date) + 1; 

    -- ==============================================================================
    -- NUEVO: VALIDACIONES DE HORARIO (EL PORTERO)
    -- ==============================================================================

    -- CASO A: Es Domingo (Día 7)
    IF v_day_of_week = 7 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Lo sentimos, no laboramos los Domingos. Por favor elige otro día.';
    END IF;

    -- CASO B: ¿Está abierto el gimnasio a esa hora?
    -- Contamos cuántos entrenadores activos tienen turno a esa hora exacta
    SELECT COUNT(*) INTO v_is_open
    FROM WeeklySchedules ws
    JOIN Staff s ON ws.staff_id = s.id
    WHERE ws.day_of_week = v_day_of_week
      AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
      AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
      AND s.is_active = 1;

    -- Si nadie está trabajando (v_is_open es 0), mandamos error de "Cerrado"
    IF v_is_open = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'El centro está cerrado en este horario. Por favor verifica nuestra disponibilidad.';
    END IF;

    -- ==============================================================================
    -- LÓGICA DE AGENDAMIENTO (Solo llegamos aquí si está abierto y es día laboral)
    -- ==============================================================================

    BEGIN
        -- Declaramos el CURSOR dentro de un bloque anidado para evitar errores de sintaxis
        DECLARE cur CURSOR FOR 
            SELECT s.id, ws.max_capacity, s.name
            FROM Staff s
            JOIN WeeklySchedules ws ON s.id = ws.staff_id
            WHERE ws.day_of_week = v_day_of_week
              AND CAST(p_time AS TIME) >= CAST(ws.start_time AS TIME) 
              AND CAST(p_time AS TIME) < CAST(ws.end_time AS TIME)
              AND s.is_active = 1
            ORDER BY s.priority_order ASC;
            
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

        OPEN cur;

        read_loop: LOOP
            FETCH cur INTO v_staff_id, v_capacity, v_assigned_staff;
            IF done THEN
                LEAVE read_loop;
            END IF;

            -- Contar ocupación actual
            SELECT COUNT(*) INTO v_current_bookings
            FROM Appointments
            WHERE staff_id = v_staff_id 
              AND appointment_date = p_date 
              AND start_time = p_time
              AND status = 'confirmed';

            -- Si hay espacio, agendamos
            IF v_current_bookings < v_capacity THEN
                INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time)
                VALUES (p_user_id, v_staff_id, p_date, p_time, ADDTIME(p_time, '01:00:00'));
                
                SELECT CONCAT('Reserva confirmada con ', v_assigned_staff) as Mensaje;
                SET done = TRUE; 
                LEAVE read_loop;
            END IF;
        END LOOP;

        CLOSE cur;
    END;
    
    -- Si llegamos al final y no se agendó nada (y no fue por estar cerrado), es que está LLENO
    IF (SELECT ROW_COUNT() = 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Lo sentimos, todos nuestros entrenadores están ocupados a esa hora.';
    END IF;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `appointments`
--

CREATE TABLE `appointments` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `appointment_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `status` enum('confirmed','cancelled') DEFAULT 'confirmed',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `staff`
--

CREATE TABLE `staff` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` enum('Entrenador','Fisioterapia','Admin','Spa') NOT NULL,
  `priority_order` int(11) DEFAULT 99,
  `is_active` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Volcado de datos para la tabla `staff`
--

INSERT INTO `staff` (`id`, `name`, `password`, `role`, `priority_order`, `is_active`) VALUES
(3, 'Adriana', '', 'Entrenador', 1, 1),
(4, 'Jorge Rodriguez', '', 'Entrenador', 2, 1),
(5, 'Ivan', '', 'Entrenador', 3, 1),
(6, 'Jonathan', '', 'Entrenador', 4, 1),
(7, 'David', '', 'Entrenador', 5, 1),
(8, 'Alexandra Mejia', '', 'Spa', 10, 1),
(9, 'Edna Rengifo', '', 'Fisioterapia', 11, 1),
(10, 'Mafe', '', 'Admin', 12, 1);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `USUARIO` varchar(255) DEFAULT NULL,
  `F_INGRESO` date DEFAULT NULL,
  `F_VENCIMIENTO` date DEFAULT NULL,
  `PLAN` varchar(255) DEFAULT NULL,
  `ESTADO` varchar(50) DEFAULT NULL,
  `N_CEDULA` varchar(50) DEFAULT NULL,
  `F_N` date DEFAULT NULL,
  `EDAD` int(11) DEFAULT NULL,
  `SEXO` varchar(10) DEFAULT NULL,
  `F_EXAMEN_LABORATORIO` date DEFAULT NULL,
  `F_CITA_NUTRICION` date DEFAULT NULL,
  `F_CITA_MED_DEPORTIVA` date DEFAULT NULL,
  `DIRECCION_O_BARRIO` varchar(255) DEFAULT NULL,
  `TELEFONO` varchar(50) DEFAULT NULL,
  `CORREO_ELECTRONICO` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `users`
--

INSERT INTO `users` (`id`, `USUARIO`, `F_INGRESO`, `F_VENCIMIENTO`, `PLAN`, `ESTADO`, `N_CEDULA`, `F_N`, `EDAD`, `SEXO`, `F_EXAMEN_LABORATORIO`, `F_CITA_NUTRICION`, `F_CITA_MED_DEPORTIVA`, `DIRECCION_O_BARRIO`, `TELEFONO`, `CORREO_ELECTRONICO`) VALUES
(1, 'Ana Maria Sanabria Clavijo', '2024-08-06', NULL, 'Experiencia Fitness plan básico', 'INACTIVO', NULL, '1983-12-27', NULL, 'F', '2024-08-14', NULL, NULL, NULL, '3057135860', 'anamasanabria@hotmail.com');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `weeklyschedules`
--

CREATE TABLE `weeklyschedules` (
  `id` int(11) NOT NULL,
  `staff_id` int(11) NOT NULL,
  `day_of_week` int(11) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `max_capacity` int(11) DEFAULT 5
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Volcado de datos para la tabla `weeklyschedules`
--

INSERT INTO `weeklyschedules` (`id`, `staff_id`, `day_of_week`, `start_time`, `end_time`, `max_capacity`) VALUES
(1, 3, 1, '05:00:00', '10:00:00', 5),
(2, 3, 1, '15:00:00', '19:00:00', 5),
(3, 3, 2, '05:00:00', '10:00:00', 5),
(4, 3, 2, '15:00:00', '19:00:00', 5),
(5, 3, 3, '05:00:00', '10:00:00', 5),
(6, 3, 3, '15:00:00', '19:00:00', 5),
(7, 3, 4, '05:00:00', '10:00:00', 5),
(8, 3, 4, '15:00:00', '19:00:00', 5),
(9, 3, 5, '05:00:00', '10:00:00', 5),
(10, 3, 6, '07:00:00', '11:00:00', 5),
(11, 4, 1, '05:00:00', '12:00:00', 5),
(12, 4, 2, '05:00:00', '12:00:00', 5),
(13, 4, 3, '05:00:00', '12:00:00', 5),
(14, 4, 4, '05:00:00', '12:00:00', 5),
(15, 4, 5, '05:00:00', '12:00:00', 5),
(16, 4, 6, '07:00:00', '11:00:00', 5),
(17, 5, 1, '05:00:00', '10:00:00', 5),
(18, 5, 2, '05:00:00', '10:00:00', 5),
(19, 5, 3, '05:00:00', '10:00:00', 5),
(20, 5, 4, '05:00:00', '10:00:00', 5),
(21, 5, 5, '05:00:00', '10:00:00', 5),
(22, 5, 5, '15:00:00', '17:00:00', 5),
(23, 6, 1, '05:00:00', '09:00:00', 5),
(24, 6, 1, '16:00:00', '20:00:00', 5),
(25, 6, 3, '05:00:00', '09:00:00', 5),
(26, 6, 3, '16:00:00', '20:00:00', 5),
(27, 6, 5, '05:00:00', '09:00:00', 5),
(28, 6, 5, '16:00:00', '20:00:00', 5),
(29, 6, 2, '05:00:00', '10:00:00', 5),
(30, 6, 2, '17:00:00', '20:00:00', 5),
(31, 6, 4, '05:00:00', '10:00:00', 5),
(32, 6, 4, '17:00:00', '20:00:00', 5),
(33, 6, 6, '07:00:00', '11:00:00', 5),
(34, 7, 1, '07:00:00', '11:00:00', 5),
(35, 7, 1, '15:00:00', '19:00:00', 5),
(36, 7, 2, '07:00:00', '11:00:00', 5),
(37, 7, 2, '15:00:00', '19:00:00', 5),
(38, 7, 3, '07:00:00', '11:00:00', 5),
(39, 7, 3, '15:00:00', '19:00:00', 5),
(40, 7, 4, '07:00:00', '11:00:00', 5),
(41, 7, 4, '15:00:00', '19:00:00', 5),
(42, 7, 5, '07:00:00', '11:00:00', 5),
(43, 7, 5, '15:00:00', '19:00:00', 5),
(44, 7, 6, '07:00:00', '11:00:00', 5),
(45, 8, 1, '07:00:00', '11:00:00', 1),
(46, 9, 1, '07:00:00', '11:00:00', 1),
(47, 10, 1, '07:00:00', '11:00:00', 1),
(48, 8, 1, '15:00:00', '19:00:00', 1),
(49, 9, 1, '15:00:00', '19:00:00', 1),
(50, 10, 1, '15:00:00', '19:00:00', 1),
(51, 8, 2, '07:00:00', '11:00:00', 1),
(52, 9, 2, '07:00:00', '11:00:00', 1),
(53, 10, 2, '07:00:00', '11:00:00', 1),
(54, 8, 2, '15:00:00', '19:00:00', 1),
(55, 9, 2, '15:00:00', '19:00:00', 1),
(56, 10, 2, '15:00:00', '19:00:00', 1),
(57, 8, 3, '07:00:00', '11:00:00', 1),
(58, 9, 3, '07:00:00', '11:00:00', 1),
(59, 10, 3, '07:00:00', '11:00:00', 1),
(60, 8, 3, '15:00:00', '19:00:00', 1),
(61, 9, 3, '15:00:00', '19:00:00', 1),
(62, 10, 3, '15:00:00', '19:00:00', 1),
(63, 8, 4, '07:00:00', '11:00:00', 1),
(64, 9, 4, '07:00:00', '11:00:00', 1),
(65, 10, 4, '07:00:00', '11:00:00', 1),
(66, 8, 4, '15:00:00', '19:00:00', 1),
(67, 9, 4, '15:00:00', '19:00:00', 1),
(68, 10, 4, '15:00:00', '19:00:00', 1),
(69, 8, 5, '07:00:00', '11:00:00', 1),
(70, 9, 5, '07:00:00', '11:00:00', 1),
(71, 10, 5, '07:00:00', '11:00:00', 1),
(72, 8, 5, '15:00:00', '19:00:00', 1),
(73, 9, 5, '15:00:00', '19:00:00', 1),
(74, 10, 5, '15:00:00', '19:00:00', 1),
(75, 8, 6, '07:00:00', '11:00:00', 1),
(76, 9, 6, '07:00:00', '11:00:00', 1),
(77, 10, 6, '07:00:00', '11:00:00', 1);

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_booking` (`user_id`,`appointment_date`,`start_time`),
  ADD KEY `fk_appt_users` (`user_id`),
  ADD KEY `fk_appt_staff` (`staff_id`);

--
-- Indices de la tabla `staff`
--
ALTER TABLE `staff`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `weeklyschedules`
--
ALTER TABLE `weeklyschedules`
  ADD PRIMARY KEY (`id`),
  ADD KEY `staff_id` (`staff_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `appointments`
--
ALTER TABLE `appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=59;

--
-- AUTO_INCREMENT de la tabla `staff`
--
ALTER TABLE `staff`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=406;

--
-- AUTO_INCREMENT de la tabla `weeklyschedules`
--
ALTER TABLE `weeklyschedules`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=108;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `appointments`
--
ALTER TABLE `appointments`
  ADD CONSTRAINT `fk_appt_staff` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_appt_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `weeklyschedules`
--
ALTER TABLE `weeklyschedules`
  ADD CONSTRAINT `WeeklySchedules_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
